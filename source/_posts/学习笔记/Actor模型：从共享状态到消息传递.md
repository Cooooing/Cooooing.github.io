---
layout: post
title: Actor 模型：从共享状态到消息传递
date: 2026-09-06 20:00:00
categories:
  - 学习笔记
tags:
  - Actor模型
  - 并发
  - Go
  - 消息传递
---

## 前言

并发程序最难处理的部分，通常不是“同时运行很多任务”，而是“多个任务同时读写同一份状态”。

例如，订单库存是 `10`，两个请求同时执行“读取库存 → 减一 → 写回”。若两个请求都先读到 `10`，再分别写回 `9`，就会少扣一次库存。这类问题称为**竞态条件（race condition）**。互斥锁可以保护临界区，但开发者需要持续回答几个问题：哪份数据由哪把锁保护、锁的获取顺序是什么、调用外部服务时能否持锁、异常路径会不会漏解锁。

Actor 模型提供了另一种组织思路：**让一份可变状态只属于一个处理者；其他代码不能直接修改它，只能向该处理者发送消息。** 处理者在自己的上下文中逐条处理消息，因此状态变化可以按顺序推导。

## 从共享内存问题开始

先看一个不安全的计数器：

~~~go
type Counter struct {
    value int
}

func (c *Counter) Add(delta int) {
    c.value += delta
}
~~~

`c.value += delta` 在概念上至少包含“读取旧值、计算新值、写回新值”几个动作。多个 goroutine 并发调用 `Add` 时，这些动作可能交错执行；在 Go 中，这会形成数据竞争。运行 `go test -race` 或 `go run -race` 可以帮助检测这类问题，但检测结果只覆盖实际执行到的路径，不能证明其他路径一定安全。

使用 `sync.Mutex` 可以将读取和写入包围在同一个临界区内：

~~~go
type Counter struct {
    mu    sync.Mutex
    value int
}

func (c *Counter) Add(delta int) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.value += delta
}
~~~

这段代码是合理的。Actor 模型并不意味着“锁不能用”或“锁一定比 Actor 差”；它改变的是状态的**所有权（ownership）**：不让调用方直接进入临界区，而是让计数器的拥有者串行处理“增加”这一请求。

可以用下面的对比理解两种方式：

| 维度 | 共享状态 + 锁 | Actor 模型 |
| --- | --- | --- |
| 状态访问 | 多个执行单元可直接访问 | 状态由一个 Actor 私有持有 |
| 协调方式 | 调用方先获得锁 | 调用方发送消息 |
| 并发控制位置 | 分散在每个访问点 | 集中在 Actor 的消息处理循环 |
| 主要风险 | 锁遗漏、锁顺序、临界区过大 | 邮箱堆积、消息协议错误、慢处理器 |

Actor 的价值在于把“谁能改变状态”这一规则写进程序结构，而不是依赖每个调用点都正确地加锁。

## Actor 模型是什么

Actor 模型由 Carl Hewitt、Peter Bishop 和 Richard Steiger 在 1973 年的论文中提出。[原始论文](https://www.ijcai.org/Proceedings/73/Papers/027B.pdf)将 Actor 描述为接收消息后可以执行三类动作的计算实体：

1. 向已知 Actor 发送有限数量的消息；
2. 创建有限数量的新 Actor；
3. 指定用于处理下一条消息的行为。

不同框架的 API 形态不一样，但可以先把一个 Actor 看成下面四个部分：

```text
              send(message)
发送方 ─────────────────────► 邮箱（Mailbox） ──► Actor
                                              │       │
                                              │       ├─ 私有状态
                                              │       ├─ 消息处理行为
                                              │       └─ 向其他 Actor 发送消息
                                              ▼
                                           队列中的后续消息
```

- **Actor**：拥有行为和私有状态的计算单元，例如一个聊天室、一个用户会话或一个订单。
- **消息（Message）**：发送给 Actor 的请求或事件。消息应表达“发生了什么”或“希望做什么”，而不是暴露内部字段。
- **邮箱（Mailbox）**：暂存尚未处理消息的队列或类似机制。发送者通常只需投递消息，不直接调用 Actor 的内部方法。
- **地址/引用（Address/Reference）**：其他 Actor 用来投递消息的标识。它不是内部状态的访问权限。
- **调度器（Scheduler）**：负责在某个线程、goroutine 或执行器上运行 Actor。一个 Actor 不等于一个操作系统线程。

这里最重要的约束是：**同一 Actor 的可变状态只由它自己处理消息的逻辑访问。** 若框架保证同一时刻只运行一个消息处理逻辑，状态更新就不需要再被多个处理器并发访问。

“一次处理一条消息”不表示系统全局只有一条消息在执行。系统可以让成千上万个不同 Actor 并行运行；串行性只存在于单个 Actor 的状态边界内。这可以称为**局部串行、整体并发**。

## 一条消息如何流动

假设有一个订单 Actor，状态是“待支付、已支付、已取消”之一。支付服务完成扣款后，不直接写订单对象，而是发送 `PaymentSucceeded` 消息。

```text
支付服务                         订单 Actor
    │                                │
    │ PaymentSucceeded(orderID)      │
    ├──────────────► [邮箱] ─────────┤
    │                                │ 取出消息
    │                                │ 检查当前状态
    │                                │ 更新为“已支付”
    │                                │ 发送后续事件
    │                                ▼
    │                         库存 / 通知 Actor
```

完整过程可以拆成五步：

1. 发送方根据 Actor 引用找到目标邮箱，并投递消息。
2. 消息在邮箱中等待。等待时间取决于队列长度、调度器和前面消息的处理耗时。
3. 调度器为目标 Actor 安排一次执行机会。
4. Actor 取出一条消息，读取并修改自己的私有状态，必要时创建 Actor 或发送更多消息。
5. 本条消息处理结束后，Actor 才处理下一条消息。

对于订单状态机，这意味着两个“支付成功”事件不会同时修改同一订单的内存状态；后到的消息会看到前一条消息处理后的状态。它并不自动说明第二条消息应该做什么：忽略、记录为重复事件、报错还是退款，仍然是业务规则。

## 最小 Go 示例：一个 Actor 风格的计数器

Go 的 channel 和 goroutine 能构造 Actor 风格的程序，但标准库没有规定完整的 Actor 生命周期、监督树、远程透明性或持久化模型。下面的例子只实现一个重要约束：`count` 只在一个 goroutine 的消息循环中读写。

~~~go
package main

import "fmt"

// Message 是计数器可以接收的消息集合。
type Message interface {
    isCounterMessage()
}

type Add struct {
    Delta int
    Reply chan<- int
}

func (Add) isCounterMessage() {}

type Get struct {
    Reply chan<- int
}

func (Get) isCounterMessage() {}

type Stop struct {
    Done chan<- struct{}
}

func (Stop) isCounterMessage() {}

// runCounter 是唯一能够访问 count 的函数。
func runCounter(mailbox <-chan Message) {
    count := 0

    for message := range mailbox {
        switch m := message.(type) {
        case Add:
            count += m.Delta
            m.Reply <- count
        case Get:
            m.Reply <- count
        case Stop:
            close(m.Done)
            return
        }
    }
}

func main() {
    mailbox := make(chan Message, 16)
    go runCounter(mailbox)

    reply := make(chan int, 1)
    mailbox <- Add{Delta: 3, Reply: reply}
    fmt.Println(<-reply) // 3

    mailbox <- Add{Delta: 5, Reply: reply}
    fmt.Println(<-reply) // 8

    done := make(chan struct{})
    mailbox <- Stop{Done: done}
    <-done
}
~~~

这个例子中：

- `mailbox` 是 Actor 的邮箱；其他 goroutine 只能向它发送 `Message`。
- `runCounter` 是 Actor 的行为；它从单个 channel 接收消息并在一个循环中处理，因此 `count` 不会被两个处理逻辑同时访问。
- `Add`、`Get`、`Stop` 是协议的一部分。调用方不再调用 `counter.value`，而是描述自己的意图。
- `Reply` 是请求—响应模式。纯粹的事件通知不一定需要回复 channel。

这段代码仍有几个刻意保留的限制：发送到已满的 channel 会阻塞；`m.Reply <- count` 在接收者迟迟不读取时也会阻塞 Actor；关闭邮箱后的投递会 panic；Actor 内部若执行慢查询或网络 I/O，后续消息都会等待。这些限制正是工程中必须显式设计的地方。

可以用下面的规则判断代码是否仍保持了状态隔离：**除 `runCounter` 所在的消息循环外，任何代码都不能读取或写入 `count`。** 如果为了“方便”把 `*Counter` 传给其他 goroutine，或通过共享 map 保存可修改状态，Actor 的核心保证就被破坏了。

## 消息不是函数调用

普通函数调用有明确的调用栈：调用方进入被调用函数，函数返回后调用方继续执行。消息发送通常不同：发送方完成投递后，不代表目标 Actor 已经处理，也不代表处理成功。

因此，下面两段伪代码的语义不同：

~~~go
// 同步调用：返回时通常意味着函数已执行结束。
order.Pay()

// 消息发送：返回时通常只意味着消息已被本地运行时接受，
// 具体语义取决于邮箱和框架。
orderRef.Tell(Pay{})
~~~

若发送方需要结果，常见做法有三种：

1. **回复消息**：在原消息中携带发送方引用，目标处理完成后发送 `PaymentAccepted` 或 `PaymentRejected`。
2. **Future/Promise**：框架将回复消息包装为可等待的结果对象。
3. **状态查询或事件订阅**：发送方不等待单次调用，而是监听后续状态事件。

无论选哪一种，都要给超时、取消和重复消息留出位置。等待结果超时只能说明“调用方在限定时间内没有收到结果”，不能单独证明目标没有执行；网络延迟、回复丢失或发送方故障都可能造成同样的表象。

## Actor 不是消息队列

Actor 的邮箱看起来像消息队列：发送方投递消息，消费者按顺序取出并处理。把一个 Actor 理解为“**带有私有状态的单消费者**”是一个有用的起点，但 Actor 和消息队列解决的问题不同。

消息队列通常以**消息的可靠传输与削峰解耦**为中心。生产者把消息写入一个由消息中间件保存的队列或主题，消费者从中消费；消息被处理后，消费者通常不把业务状态保存在“这个消费者对象”中，而是写入数据库、缓存或其他外部存储。消息队列关心消息如何持久化、确认、重试、积压和被多个消费者分摊。

Actor 则以**状态所有权**为中心。一个 Actor 的状态只允许由它的消息处理逻辑修改；邮箱只是让外部请求按顺序进入这个状态边界的机制。Actor 接收到 `Add(1)` 后，不只是“消费了一条消息”，而是在自身状态从 `count = 3` 变为 `count = 4` 的前提下，决定是否回复、通知其他 Actor 或改变后续行为。

| 维度 | 消息队列 | Actor |
| --- | --- | --- |
| 核心目标 | 可靠传输、异步解耦、削峰与任务分发 | 将可变状态归属给单一处理者 |
| 消费者 | 通常可横向扩容、竞争消费同一队列 | 一个 Actor 的状态由其自身串行处理 |
| 状态位置 | 多在数据库、缓存或外部服务 | 以 Actor 私有状态为主要抽象，可进一步持久化 |
| 消息含义 | 常是待处理任务或领域事件 | 常是对特定状态实体的命令、事件或请求 |
| 典型扩容方式 | 增加消费者实例，提高队列吞吐 | 增加不同 Actor 的并行度，或对实体进行分片 |

两者可以组合。例如订单服务可以将 Kafka 中的 `PaymentSucceeded` 事件消费出来，再按 `orderID` 路由给对应的订单 Actor；Kafka 负责跨服务传输和持久化，订单 Actor 负责在单个订单的状态边界内依次处理事件。此时，Kafka 的分区顺序、消费重试和 Actor 的邮箱顺序仍是两套需要分别设计的语义。

因此，更准确的表述是：**Actor 常通过类似队列的邮箱实现局部串行；局部串行让同一 Actor 的私有状态免于被并发修改；但 Actor 模型的重点是状态所有权，而不是队列本身。**

## 顺序、投递与可靠性

这是 Actor 初学时最容易误解的一部分。Actor 模型强调消息传递，但**它本身不为所有实现规定统一的消息可靠性语义**。

### 顺序是局部概念

应当明确讨论的是“谁向谁发送的哪些消息”。Erlang 运行时文档说明，来自同一发送进程、发往同一接收进程的信号会按发送顺序到达；该保证不等于多个发送者合并后的全局顺序。[Erlang 进程参考](https://www.erlang.org/doc/system/ref_man_processes.html)

例如：

```text
发送者 A ── m1, m2 ──► Actor X
发送者 B ── n1, n2 ──► Actor X
```

在具备该类保证的运行时中，X 可观察到 `m1` 在 `m2` 前到达、`n1` 在 `n2` 前到达；但 `m1、n1、m2、n2` 的交叉顺序不能由此推导。若业务需要跨发送者的总顺序，就需要单独建立排序者、序列号、单分区日志或共识机制。

### 发送成功不等于处理成功

Akka 文档将默认消息投递描述为 **at-most-once（至多一次）**：消息可能不送达，但在正常语义下不会因为框架重试而重复送达。[Akka：Message Delivery Reliability](https://doc.akka.io/libraries/akka-core/current/general/message-delivery-reliability.html)

“至少一次（at-least-once）”通过重试提高送达概率，但可能产生重复消息；“恰好一次（exactly-once）”需要在确定的边界内同时处理投递、状态和副作用，代价高且不能仅靠 Actor API 获得。对于支付、扣库存、发邮件等外部副作用，通常应使用：

- 业务唯一标识，例如 `eventID` 或 `requestID`；
- 幂等处理，即同一消息重复执行的可观察结果与执行一次相同；
- 持久化的去重记录或状态机；
- 超时后的查询和补偿流程，而不是盲目重试。

### 邮箱不是无限缓冲区

邮箱容量决定系统在流量高峰时如何表现：

- **无界邮箱**可以暂时吸收突发流量，但若生产速度长期超过消费速度，内存占用会持续增长，最终可能触发进程故障。
- **有界邮箱**可以限制内存，但满时必须选择策略：阻塞发送、拒绝、丢弃、转移到死信队列，或对上游施加背压。
- **优先级邮箱**可让紧急消息先处理，但如果普通消息长期被抢占，就会发生饥饿。

因此，“Actor 天生高并发”并不准确。Actor 只能让状态管理更清晰；吞吐量仍受单个 Actor 的处理耗时、邮箱策略、调度器、CPU、I/O 和下游服务限制。

## 失败隔离与监督

当一个普通函数抛出异常或返回错误时，通常由调用栈上的代码处理。Actor 系统中，失败常被视为消息处理单元的生命周期事件：一个 Actor 失败后，应该由谁决定重试、重启、停止或将错误上报？

Erlang/OTP 用进程、链接和监督者组织故障处理；[OTP Design Principles 的监督者章节](https://www.erlang.org/doc/system/sup_princ.html)说明监督者负责启动、停止和重启子进程。Akka 也将监督关系组织为父子 Actor 的树形结构，并将失败处理策略放在父级。[Akka Supervision](https://doc.akka.io/libraries/akka-core/current/general/supervision.html)

可以抽象为：

```text
Supervisor
 ├─ OrderActor(order-1)
 ├─ OrderActor(order-2)
 └─ NotificationActor
```

当 `OrderActor(order-1)` 处理某条消息失败时，监督者可能：

1. **停止**该 Actor；
2. **重启**该 Actor；
3. **恢复/忽略当前失败**，继续处理后续消息；
4. **升级失败**，交由更上层处理。

这些词的精确定义取决于框架。尤其需要注意：**重启内存中的 Actor 不能自动恢复正确业务状态。** 若状态只存在内存，重启后状态可能回到初始值；若消息已经触发数据库写入、外部 HTTP 调用或邮件发送，重试还可能重复产生副作用。监督机制提供的是故障处理的组织方式，不替代持久化、幂等和事务设计。

## Actor 与 Go channel、锁、事件循环的关系

### Actor 与锁

锁适合保护一小段共享临界区，代码路径短、共享对象少时往往直接有效。Actor 更适合“一个业务实体长期拥有状态，并持续接收外部事件”的问题，例如会话、房间、设备、订单或分区。

一个实用的判断是：如果每次操作都在问“这把锁该由谁持有”，可以考虑把对应状态收敛到 Actor；如果只是给一个简单计数器加一，使用锁可能更少额外开销。

### Actor 与 CSP / Go channel

Go 的官方建议常概括为“不要通过共享内存来通信；应通过通信来共享内存”。[Effective Go：Channels](https://go.dev/doc/effective_go#channels) 中的 channel 是 CSP 风格通信工具；Go 规范定义了发送、接收和关闭操作的阻塞行为。[Go Spec：Channel types](https://go.dev/ref/spec#Channel_types)

Actor 和 CSP 都鼓励通过消息而非共享可变内存协作，但侧重点不同：

| 维度 | CSP / Go channel | Actor |
| --- | --- | --- |
| 主要抽象 | 通信通道与并发活动 | 有身份、行为和私有状态的实体 |
| 接收方式 | 可在多个 channel 上选择接收 | 通常向 Actor 地址投递到其邮箱 |
| 状态所有权 | 由程序设计约定 | Actor 的私有状态是模型核心 |
| 生命周期/容错 | 标准库提供基础原语 | 成熟 Actor 框架通常提供监督、路由、死信等能力 |

Go 代码可以使用 channel 实现 Actor 风格，前面的计数器就是例子；但“使用了 channel”不自动使程序成为 Actor 模型。若多个 goroutine 仍然共享并修改同一个 map，问题依旧存在。

### Actor 与事件循环

事件循环通常由一个循环从队列取事件并分发处理，例如 GUI 主线程或网络 Reactor。一个 Actor 的邮箱循环看起来很相似，但 Actor 模型更强调状态的归属、Actor 之间的异步通信和故障边界。实际系统也可以将许多 Actor 复用在少量事件循环或线程池上执行。

## 如何划分 Actor

Actor 的粒度决定了并行度、状态一致性边界和运维成本。常见划分方式包括：

- **按实体**：一个订单、用户会话、设备或游戏房间一个 Actor。适用于实体内状态必须顺序变化的场景。
- **按分区**：按用户 ID、商品 ID 或房间 ID 的哈希划分，每个分区一个 Actor。适用于实体数量极多、不必为每个实体常驻一个 Actor 的场景。
- **按职责**：通知、限流、路由、库存等各自一个或一组 Actor。适用于职责边界清楚的流水线。

粒度过粗时，一个 Actor 会成为吞吐瓶颈；粒度过细时，创建、路由、内存占用和跨 Actor 协作成本会上升。先以“哪些状态必须一起保持顺序和一致性”为边界，再考虑吞吐和分片，通常比先按类名拆分更可靠。

消息协议也需要像接口或数据库表一样认真设计：

- 使用明确的消息类型，例如 `ReserveStock`、`StockReserved`、`ReservationFailed`；避免只传一个含义模糊的字符串。
- 消息尽量不可变。尤其不要在发送后继续修改其中的 slice、map 或指针所指对象。
- 为请求和事件加入关联 ID，便于去重、追踪和日志关联。
- 明确每种消息的前置状态、成功结果、失败结果和超时处理。
- 不要让一个 Actor 的消息直接携带另一个 Actor 的内部可变对象。

## 适用场景与不适用场景

Actor 模型常适合以下问题：

- 聊天室、游戏房间、WebSocket 会话等有独立状态且事件连续到达的对象；
- 订单、设备、任务等需要由状态机表达生命周期的对象；
- 需要将失败隔离到子任务或子实体的系统；
- 分布式系统中需要以消息边界组织本地和远程协作的场景。

以下情况未必值得引入完整 Actor 框架：

- 简单、短暂且同步的业务流程；
- 只需保护少量共享字段的临界区；
- 计算热点对消息分派、对象创建和队列延迟极其敏感；
- 团队尚未具备监控邮箱长度、处理延迟、死信和重试链路的能力。

是否使用 Actor，不应由“并发量很大”单独决定。更重要的问题是：状态是否可以清楚地归属给一个实体？实体之间是否天然以事件或命令协作？失败和重试是否需要独立处理？

## 实践检查清单

在将 Actor 用于实际业务前，至少确认以下问题：

- [ ] 每份可变状态的唯一拥有者是谁？是否仍被其他线程、goroutine 或缓存直接修改？
- [ ] 每种消息的含义、前置条件、幂等键和预期回复是什么？
- [ ] 邮箱有界还是无界？满时是阻塞、拒绝、丢弃还是背压？
- [ ] 单条消息处理是否包含数据库、网络或磁盘 I/O？其最长耗时和超时策略是什么？
- [ ] 消息投递语义是什么？发送、接收、执行和回复分别在哪个阶段可能失败？
- [ ] 重启后如何恢复状态？外部副作用如何去重或补偿？
- [ ] 是否监控邮箱长度、消息等待时间、处理耗时、失败数、重启数和死信数？

## 总结

Actor 模型的核心不是“创建大量轻量线程”，而是**以消息边界明确状态所有权**：一个 Actor 私有地维护状态，其他参与者通过消息请求它改变状态。单个 Actor 内的顺序处理能消除该状态边界内的大量并发交错，但不会自动解决消息丢失、重复、慢 I/O、全局顺序、事务或持久化问题。

对初学者而言，先用一个小对象练习最有价值：让一个 goroutine 独占状态，只用 channel 投递不可变消息，再观察邮箱满、请求超时和重复消息时系统的行为。理解这些边界后，再学习 Erlang/OTP、Akka、Orleans 或 Proto.Actor 等框架提供的监督、路由与分布式能力，才不会把框架机制误认为并发问题本身已经消失。

## 参考资料

1. Carl Hewitt, Peter Bishop, Richard Steiger. [A Universal Modular ACTOR Formalism for Artificial Intelligence (1973)](https://www.ijcai.org/Proceedings/73/Papers/027B.pdf)。Actor 基本能力的原始表述。
2. Erlang/OTP. [Reference Manual: Processes](https://www.erlang.org/doc/system/ref_man_processes.html)。进程、信号和发送方—接收方顺序保证。
3. Erlang/OTP. [OTP Design Principles: Supervisor Behaviour](https://www.erlang.org/doc/system/sup_princ.html)。监督者与重启策略。
4. Akka. [Message Delivery Reliability](https://doc.akka.io/libraries/akka-core/current/general/message-delivery-reliability.html)。至多一次投递及消息顺序的框架语义。
5. Akka. [Fault Tolerance: Supervision](https://doc.akka.io/libraries/akka-core/current/general/supervision.html)。父子监督关系。
6. Go. [The Go Programming Language Specification: Channel types](https://go.dev/ref/spec#Channel_types)。channel 的语言级语义。
7. Go. [Effective Go: Channels](https://go.dev/doc/effective_go#channels)。Go 中通过通信组织并发的实践建议。
