---
translatedFrom: "tech/gorm-preload-mechanism"
lang: "zh-TW"
title: "深入剖析 GORM 的 Preload 機制"
excerpt: "了解 GORM 的 Preload 在底層是怎麼運作的——從延遲載入的陷阱，到 Go 微服務中最佳化過的預先載入策略。"
readTime: 8
sourceHash: "9ba715d6fe209335"
---

GORM 的 `Preload` 是 Go 處理關聯式資料時最強大的功能之一。但如果不了解它的內部運作，很容易掉進 N+1 查詢的陷阱，在不知不覺中拖累服務的效能。Preload 的方便是有代價的，而這筆代價是用往返次數來付，不是 CPU。

這篇文章是我剛起步時就希望手邊有的筆記。我們會一步步看清楚 `Preload` 究竟產生了什麼 SQL、什麼時候該優先用 `Joins`、怎麼讓查詢次數維持在可控的範圍內，以及我在正式環境的 Go 服務中慣用的模式。

## Preload 想解決的 N+1 問題

先從最簡單的情況開始。你有一個 `User`，底下有多筆 `Order`：

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

如果不用預先載入，要撈出 100 位使用者和他們的訂單，會是這樣：

```go
var users []User
db.Find(&users)                     // 1 次查詢
for i := range users {
    db.Where("user_id = ?", users[i].ID).Find(&users[i].Orders) // N 次查詢
}
```

100 位使用者就發出 101 次查詢——標準的 N+1。在網路 RTT 為 1ms 的 MySQL 部署環境中，應用程式邏輯連一個位元組都還沒跑，你就白白多了 100ms。

## Preload 如何產生 SQL

Preload 解決 N+1 的方式，是把 N 次關聯查詢合併成**一次**。當你呼叫 `db.Preload("Orders").Find(&users)` 時，實際發生的事情如下：

1. GORM 執行基本的 `SELECT * FROM users`。
2. 從結果集中收集主鍵：`[1, 2, 3, ..., 100]`。
3. 只執行一次 `SELECT * FROM orders WHERE user_id IN (1, 2, ..., 100)`。
4. 在 Go 裡依 `user_id` 比對，把訂單分配回每位使用者。

所以查詢次數是 **2**，不是 101。GORM 是用一個更長的 `IN` 清單，加上多一次記憶體走訪，換掉 N 次 SQL 往返。

你可以用 GORM 的 logger 來驗證：

```go
db := db.Debug().Preload("Orders").Find(&users)
// [0.321ms] SELECT * FROM `users`
// [0.854ms] SELECT * FROM `orders` WHERE `user_id` IN (1,2,3,...)
```

### 巢狀 Preload：它是遞迴的

`Preload("Orders.Items")` 的運作方式一模一樣——遞迴進行。GORM 會執行三次查詢：users、orders（依 user_id）、items（依 order_id）。每一層是一次往返，而不是 N 次。

有個不容易察覺的地方：如果有三層深、1000 筆父資料，最末層的 `IN` 清單可能會變得非常龐大。MySQL 的 `max_allowed_packet`（預設 64MB）通常吃得下，但到了某個程度，解析器本身就會變成瓶頸。我看過 `IN` 清單有 5 萬個元素的單一查詢，光是規劃執行計畫就花了 200ms。如果你要在大型結果集上分頁，就要積極地分批處理。

## Preload 與 Joins：兩種不同的工具

`Preload` 和 `Joins` 在 GORM 的 DSL 中看起來可以互換，但產生的 SQL 截然不同。

**Preload** 會發出各自獨立的查詢，再在 Go 裡拼接起來：

```sql
SELECT * FROM users;
SELECT * FROM orders WHERE user_id IN (...);
```

**Joins** 會產生一條帶有 JOIN 的查詢：

```sql
SELECT users.*, orders.*
FROM users LEFT JOIN orders ON orders.user_id = users.id;
```

取捨如下：

- **一對一／多對一**：優先用 `Joins`。一次查詢，沒有重複資料，也沒有拼接的負擔。
- **一對多**：優先用 `Preload`。`Joins` 會為每一筆子資料複製一次父列，讓網路上傳輸的位元組暴增，還逼你在應用程式碼裡自己去重。
- **多對多**：一律用 `Preload`。GORM 用 `Joins` 處理中介資料表時既冗長又容易出錯。
- **需要依關聯資料表篩選時**：用 `Joins` 處理 WHERE 子句，如果需要完整的關聯資料，再另外 `Preload`。兩者混用沒有問題。

### 列重複的陷阱

我曾經在一個一對多關聯上把 `Preload` 換成 `Joins`，想藉此「最佳化」一個使用者清單的端點。載入時間從 180ms 變成 2.4 秒。為什麼？每位使用者大約有 200 筆訂單，所以 join 會為每位使用者產生 200 列。500 位使用者就是 10 萬列，而且大多是重複的使用者資料。查詢本身很快——毀掉它的是網路傳輸成本和 Go 端的去重。

經驗法則：如果子資料表的基數沒有上限，就用 `Preload`。永遠如此。

## 自訂 Preload 範圍

讓 Preload 在我心中從「方便」升級成「不可或缺」的，是它接受函式參數的寫法：

```go
db.Preload("Orders", func(tx *gorm.DB) *gorm.DB {
    return tx.Where("status = ?", "paid").
        Order("created_at DESC").
        Limit(10)
}).Find(&users)
```

這讓你可以限制被預先載入的資料列。我在正式環境中常用的模式如下：

**狀態篩選**——只載入啟用中的子資料：

```go
db.Preload("Subscriptions", "status = ?", "active").Find(&users)
```

**Limit + 排序**——每個父資料各取前 N 筆很棘手；單純的 `Limit` 是全域套用的，不是針對每個父資料。要做到依父資料各自限制筆數，你需要視窗函式：

```go
db.Preload("Posts", func(tx *gorm.DB) *gorm.DB {
    return tx.Where("id IN (?)",
        tx.Model(&Post{}).Select(
            "FIRST_VALUE(id) OVER (PARTITION BY user_id ORDER BY created_at DESC)",
        ),
    )
})
```

很醜，但它只是一次查詢。另一種做法——發出 N 次有限制筆數的查詢——正是我們一開始碰到的 N+1。

**只選需要的欄位**——Preload 預設會用 `SELECT *` 撈資料。在寬資料表上，這很浪費：

```go
db.Preload("Orders", func(tx *gorm.DB) *gorm.DB {
    return tx.Select("id, user_id, total, created_at")
}).Find(&users)
```

當子資料表帶有端點根本不會讀的大型欄位（JSON 快照、TEXT、BLOB）時，這點最重要：只選取需要的欄位，能讓資料庫要讀取、排序和傳送的每一列都變小。

## 正式環境的實用建議

幾個能讓 Preload 不在正式環境出包的模式：

- **一定要限制 `IN` 清單的長度**。如果你可能要對 1 萬筆父資料做預先載入，在打到資料庫之前，先切成每批 1000 筆。MySQL 處理得了很大的 `IN` 子句，但規劃執行計畫的時間會呈非線性成長。
- **在測試中計算查詢次數**。寫一個包裝 `*gorm.DB` 並計算執行次數的輔助函式。斷言「這個端點執行 ≤ 5 次查詢」，讓回歸問題大聲現形，而不是無聲無息。
- **小心多型關聯**。在多型欄位上 `Preload("Attachments")` 會*每種類型*各發一次查詢，而不是總共一次。這很違反直覺，值得寫個單元測試。
- **開啟 `PrepareStmt`**。它會跨請求快取預備陳述式。對一個依序執行同樣 4 次查詢的端點來說，這能省下出乎意料的一大塊單次查詢開銷。
- **每個端點都看一次 Debug 輸出**。GORM 的鏈式 API 把很多東西藏起來了。想知道你送出去的到底是什麼 SQL，唯一的方法就是親眼看。

## 結語

Preload 是一根槓桿。拉對了，它能把數百次往返壓縮成兩三次。隨便亂拉，它一樣會壓縮——但也會順便載入你用不到的欄位、你不想要的 join，以及你從來不篩選的子資料。我腦中一直記著的心智模型是：**每個 `Preload` 都是一次獨立的查詢；每個 `Joins` 都是一列更大的資料**。一旦內化了這一點，每個岔路上的正確選擇就會變得顯而易見。

最快的查詢，依然是你根本不必執行的那一次。在邊緣做快取，把 schema 設計成熱門路徑不需要三層 join，把 Preload 留給關聯模型真正符合請求形狀的時候。
