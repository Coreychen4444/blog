---
translatedFrom: "tech/gorm-preload-mechanism"
lang: "zh"
title: "深入解析 GORM 的 Preload 机制"
excerpt: "弄清 GORM 的 Preload 在底层是如何工作的——从懒加载的陷阱，到 Go 微服务中经过优化的预加载策略。"
readTime: 8
sourceHash: "9ba715d6fe209335"
---

GORM 的 `Preload` 是 Go 中处理关系型数据最强大的功能之一。但如果不了解它的内部机制，很容易掉进 N+1 查询的陷阱，悄无声息地拖慢服务的性能。Preload 的便利是有代价的，而这份代价是用网络往返来支付的，不是 CPU。

这篇文章是我刚起步时就希望能拥有的那份笔记。我们会逐一看清 `Preload` 到底生成了什么 SQL、什么时候应该优先用 `Joins`、如何把查询次数控制在有限范围内，以及我在生产环境的 Go 服务里常用的模式。

## Preload 想要解决的 N+1 问题

从最简单的情况说起。你有一个 `User`，它有多个 `Order`：

```go
type User struct {
    ID     uint
    Name   string
    Orders []Order
}

type Order struct {
    ID     uint
    UserID uint
    Total  int64
}
```

如果不用预加载，获取 100 个用户及其订单是这样的：

```go
var users []User
db.Find(&users)                     // 1 次查询
for i := range users {
    db.Where("user_id = ?", users[i].ID).Find(&users[i].Orders) // N 次查询
}
```

100 个用户就要发出 101 条查询——典型的 N+1。在网络 RTT 为 1ms 的 MySQL 部署中，应用逻辑还一个字节都没跑，你就已经白白多出了 100ms。

## Preload 如何生成 SQL

Preload 解决 N+1 的办法，是把 N 条关联查询合并成**一条**。调用 `db.Preload("Orders").Find(&users)` 时，实际发生的是：

1. GORM 执行基础查询 `SELECT * FROM users`。
2. 从结果集中收集主键：`[1, 2, 3, ..., 100]`。
3. 执行一条 `SELECT * FROM orders WHERE user_id IN (1, 2, ..., 100)`。
4. 在 Go 中，按 `user_id` 进行匹配，把订单分配回各个用户。

所以查询次数是 **2**，而不是 101。GORM 是用一个更大的 `IN` 列表和一次额外的内存遍历，换掉了 N 次 SQL 往返。

可以用 GORM 的 logger 来验证这一点：

```go
db := db.Debug().Preload("Orders").Find(&users)
// [0.321ms] SELECT * FROM `users`
// [0.854ms] SELECT * FROM `orders` WHERE `user_id` IN (1,2,3,...)
```

### 嵌套 Preload：它是递归的

`Preload("Orders.Items")` 的工作方式完全一样——递归进行。GORM 执行三条查询：users、orders（按 user_id）、items（按 order_id）。每一层是一次往返，而不是 N 次。

有一点不太容易察觉：如果嵌套三层、有 1000 条父记录，叶子层的 `IN` 列表可能会变得非常大。MySQL 的 `max_allowed_packet`（默认 64MB）通常能吃得下，但到了某个程度，解析器本身就会成为瓶颈。我见过 `IN` 列表有 5 万个元素的单条查询，光是生成执行计划就花了 200ms。如果你在大结果集上做分页，就要果断地分块。

## Preload 与 Joins：两种不同的工具

`Preload` 和 `Joins` 在 GORM 的 DSL 里看起来可以互换，但生成的 SQL 截然不同。

**Preload** 发出多条独立的查询，再在 Go 中拼接起来：

```sql
SELECT * FROM users;
SELECT * FROM orders WHERE user_id IN (...);
```

**Joins** 生成一条带 JOIN 的查询：

```sql
SELECT users.*, orders.*
FROM users LEFT JOIN orders ON orders.user_id = users.id;
```

权衡如下：

- **一对一 / 多对一**：优先用 `Joins`。一条查询，没有重复，也没有拼接开销。
- **一对多**：优先用 `Preload`。`Joins` 会为每个子记录复制一份父行，让网络上传输的字节膨胀，还迫使你在应用代码里去重。
- **多对多**：一律用 `Preload`。GORM 用 `Joins` 处理中间表时既啰嗦又容易出错。
- **需要按关联表过滤时**：用 `Joins` 写 WHERE 子句，如果需要完整的关联数据，再单独 `Preload`。两者混用没有问题。

### 行重复陷阱

我曾经在一个一对多关联上把 `Preload` 换成 `Joins`，以此“优化”一个用户列表接口。加载时间从 180ms 变成了 2.4 秒。为什么？每个用户大约有 200 个订单，所以 join 会为每个用户产生 200 行。500 个用户就是 10 万行，而且大部分是重复的用户数据。查询本身很快——是网络传输开销和 Go 端的去重把它拖垮了。

经验法则：如果子表的基数没有上限，就用 `Preload`。永远如此。

## 自定义 Preload 作用域

让 Preload 在我这里从“方便”变成“不可或缺”的，是它的函数参数形式：

```go
db.Preload("Orders", func(tx *gorm.DB) *gorm.DB {
    return tx.Where("status = ?", "paid").
        Order("created_at DESC").
        Limit(10)
}).Find(&users)
```

这让你可以约束被预加载的行。我在生产环境中常用的模式：

**状态过滤** —— 只加载处于活跃状态的子记录：

```go
db.Preload("Subscriptions", "status = ?", "active").Find(&users)
```

**Limit + 排序** —— 每个父记录取前 N 条比较棘手；普通的 `Limit` 是全局生效的，而不是按父记录生效。要按父记录做限制，你需要窗口函数：

```go
db.Preload("Posts", func(tx *gorm.DB) *gorm.DB {
    return tx.Where("id IN (?)",
        tx.Model(&Post{}).Select(
            "FIRST_VALUE(id) OVER (PARTITION BY user_id ORDER BY created_at DESC)",
        ),
    )
})
```

写法很丑，但只有一条查询。另一种做法——发出 N 条带限制的查询——恰恰就是我们一开始面对的 N+1。

**只选需要的列** —— Preload 默认拉取的是 `SELECT *`。在宽表上这很浪费：

```go
db.Preload("Orders", func(tx *gorm.DB) *gorm.DB {
    return tx.Select("id, user_id, total, created_at")
}).Find(&users)
```

当子表带有接口根本不会读取的大字段（JSON 快照、TEXT、BLOB）时，这一点最为重要：只选需要的列，会让数据库需要读取、排序和发送的每一行都变小。

## 生产环境建议

几个能让 Preload 不在生产环境里坑你的模式：

- **始终给 `IN` 列表设上限**。如果你可能要针对 1 万条父记录做预加载，在访问数据库之前，先把它们分成每批 1000 条。MySQL 能处理很大的 `IN` 子句，但生成执行计划的时间是非线性增长的。
- **在测试里统计查询次数**。写一个包装 `*gorm.DB` 并统计执行次数的辅助函数。断言“这个接口执行 ≤ 5 条查询”，让回归问题大声暴露出来，而不是悄无声息。
- **当心多态关联**。在多态字段上 `Preload("Attachments")` 会*按每种类型*各发一条查询，而不是总共一条。这很反直觉，值得写一个单元测试。
- **开启 `PrepareStmt`**。它会跨请求缓存预编译语句。对于一个按顺序执行同样 4 条查询的接口，这能省掉出人意料的一大块单次查询开销。
- **每个接口都读一遍 Debug 输出**。GORM 的链式 API 隐藏了很多东西。想知道你实际发出去的是什么 SQL，唯一的办法就是亲眼看一看。

## 结语

Preload 是一根杠杆。拉对了，它能把数百次往返压缩成两三次。拉得随意，它照样能压缩——但同时也会加载你用不到的列、你不想要的 join，以及你从不过滤的子记录。我脑子里一直保留的心智模型是：**每个 `Preload` 都是一条独立的查询；每个 `Joins` 都是一行更大的数据**。一旦把这一点内化，每个分支上的正确选择都会变得显而易见。

最快的查询仍然是你不用执行的那一条。在边缘做缓存，设计好 schema 让热点路径不需要三层 join，把 Preload 留给关系模型真正契合请求形态的场景。
