---
layout: post
title: 《apache Kafka实战》读书笔记-producer、consumer和设计原理
date: 2025-03-12 22:56:21
categories:
  - 读书笔记
tags:
  - 《apache Kafka实战》
  - kafka
---

springboot 开发参考 [Spring for Apache Kafka\Introduction\Quick Tour](https://docs.spring.io/spring-kafka/reference/quick-tour.html)

## 第四章 - producer开发

### producer概览

Kafka producer 是负责向 Kafka 写入数据的应用程序。

Kafka producer在设计上要比consumer简单一些，因为它不涉及复杂的组管理操作，即每个producer都是独立进行工作的，与其他producer实例之间没有关联，因此它受到的牵绊自然也要少得多，实现起来也要简单得多。
**producer的首要功能就是向某个 topic的某个分区发送一条消息**，所以它首先需要确认到底要向 topic 的哪个分区写入消息——这就是分区器（partitioner）要做的事情。
Kafka producer 提供了一个默认的分区器。对于每条待发送的消息而言，如果该消息指定了 key，那么该 partitioner 会根据 key的哈希值来选择目标分区；
若这条消息没有指定 key，则 partitioner 使用轮询的方式确认目标分区——这样可以最大限度地确保消息在所有分区上的均匀性。
当然producer的API赋予了用户自行指定目标分区的权力，即用户可以在消息发送时跳过partitioner直接指定要发送到的分区。
另外，producer 也允许用户实现自定义的分区策略而非使用默认的 partitioner，这样用户可以很灵活地根据自身的业务需求确定不同的分区策略。

通过 partitioner，我们就可以确信具有相同 key的所有消息都会被路由到相同的分区中。
这有助于实现一些特定的业务需求，比如可以利用局部性原理，将某些producer发送的消息固定地发送到相同机架上的分区从而减少网络传输的开销等。
如果没有指定key，那么所有消息会被均匀地发送到所有分区，而这通常也是最合理的分区策略。

确认了目标分区后，producer 要做的第二件事情就是要寻找这个分区对应的 leader，也就是该分区leader副本所在的Kafka broker。
每个topic分区都由若干个副本组成，其中的一个副本充当leader的角色，也只有leader才能够响应clients发送过来的请求，而剩下的副本中有一部分副本会与 leader副本保持同步，即所谓的 ISR。
因此在发送消息时，producer 也就有了多种选择来实现消息发送。比如不等待任何副本的响应便返回成功，或者只是等待 leader副本响应写入操作之后再返回成功等。

在java中，producer首先使用一个线程（用户主线程，也就是用户启动 producer的线程）将待发送的消息封装进一个 ProducerRecord 类实例。
然后将其序列化之后发送给 partitioner，再由后者确定了目标分区后一同发送到位于 producer程序中的一块内存缓冲区中。
而 producer的另一个工作线程（I/O发送线程，也称 Sender线程）则负责实时地从该缓冲区中提取出准备就绪的消息封装进一个批次（batch），统一发送给对应的broker。

![Java版本producer工作流程.png](../images/《apache%20Kafka实战》读书笔记-producer、consumer和设计原理/Java版本producer工作流程.png)

### 消息分区机制

随 Kafka 发布的默认partitioner会尽力确保具有相同key的所有消息都会被发送到相同的分区上；若没有为消息指定 key，则该 partitioner会选择轮询的方式来确保消息在 topic的所有分区上均匀分配。
自定义分区策略实现`org.apache.kafka.clients.producer.Partitioner`接口即可：

1. **`int partition(String topic, Object key, byte[] keyBytes, Object value, byte[] valueBytes, Cluster cluster)`** 计算消息的目标分区。
	- `topic`: 主题名称。
	- `key/value`: 消息的键值（可能为 `null`）。
	- `keyBytes/valueBytes`: 序列化后的键值字节数组。
	- `cluster`: 当前集群元数据（如可用分区信息）。
2. **`void close()`** 区器时释放资源（如网络连接或线程池）。
3. **`void configure(Map<String, ?> configs)`** 分区器时调用，传递生产者的配置参数（如 `partitioner.class` 中配置的自定义参数）。

### 消息序列化

在网络中发送数据都是以字节的方式。
序列化器（serializer）负责在 producer 发送前将消息转换成字节数组；而与之相反，解序列化器（deserializer）则用于将 consumer 接收到的字节数组转换成相应的对象。

Kafka 支持用户自定义消息序列化。若要编写一个自定义的 serializer，需要实现 `org.apache.kafka.common.serialization.Serializer` 接口：

1. **`void configure(Map<String, ?> configs, boolean isKey)`** 初始化序列化器，读取生产者/消费者的配置参数（如编码格式、压缩类型等）。
	- `configs`: Kafka 配置（如 `ProducerConfig` 或 `ConsumerConfig` 中的键值对）。
	- `isKey`: 标记当前序列化的是键（Key）还是值（Value）。
2. **`byte[] serialize(String topic, T data)`** 将对象 `data` 序列化为字节数组。
	- `topic`: 目标主题名称（某些序列化器可能依赖主题元数据）。
	- `data`: 待序列化的对象（可能是 `null`）。
3. **`void close()`** 关闭序列化器时释放资源（如文件句柄、网络连接等）。

### 拦截器

对于 producer而言，interceptor使得用户在消息发送前以及 producer回调逻辑前有机会对消息做一些定制化需求，比如修改消息等。
同时，producer 允许用户指定多个 interceptor 按序作用于同一条消息从而形成一个拦截链（interceptor chain）。interceptor 的实现接口是`org.apache.kafka.clients.producer.ProducerInterceptor`

### 无消息丢失配置

Java 版本 producer 用户采用异步发送机制。KafkaProducer.send 方法仅仅把消息放入缓冲区中，由一个专属 I/O 线程负责从缓冲区中提取消息并封装进消息 batch中，然后发送出去。
显然，这个过程中存在着数据丢失的窗口：若 I/O线程发送之前 producer崩溃，则存储缓冲区中的消息全部丢失了。这是producer需要处理的很重要的问题。

producer 的另一个问题就是消息的乱序。如果发送两条消息 record1 和 record2。
由于某些原因（比如瞬时的网络抖动）导致 record1未发送成功，同时 Kafka 又配置了重试机制以及max.in.flight.requests.per.connection大于1（默认值是5）。
那么producer重试 record1成功后，record1在日志中的位置反而位于 record2之后，这样造成了消息的乱序。

很容易想到的一个方案就是：既然异步发送可能丢失数据，改成同步发送似乎是一个不错的主意。但是性能会很差，并不推荐在实际场景中使用。
因此最好能有一份配置，既使用异步方式还能有效地避免数据丢失，即使出现producer崩溃的情况也不会有问题。

#### 生产者（Producer）配置

1. **`block.on.buffer.full = true`（已过时）**
	- 替代参数：`max.block.ms`（Kafka 0.9+ 后使用）
	- 作用：当生产者缓冲区（内存）满时，阻塞生产者线程（而非丢弃消息），直到缓冲区有空间或超时。
	- 配置原因：防止因生产者发送速度过快导致缓冲区溢出，从而丢失消息。
	- 注意：在高版本 Kafka 中，此参数已被 `max.block.ms` 替代，需设置为一个较大的值（如 `max.block.ms=60000`）。
2. **`acks = all` 或 `acks = -1`**
	- 作用：要求所有 ISR（In-Sync Replicas，同步副本）确认消息写入后，生产者才认为发送成功。
	- 配置原因：确保消息至少被写入 Leader 和所有 ISR 副本的磁盘，避免 Leader 副本宕机后消息丢失。
3. **`retries = Integer.MAX_VALUE`**
	- 作用：设置生产者无限重试发送失败的消息。
	- 配置原因：应对网络抖动、Broker 临时不可用等场景，确保消息最终成功写入。
	- 注意：需结合 `delivery.timeout.ms`（默认 120 秒）控制总重试时间，避免无限阻塞。
4. **`max.in.flight.requests.per.connection = 1`**
	- 作用：限制单个连接上未确认的请求数最多为 1。
	- 配置原因：防止因网络问题导致消息乱序重试时覆盖先前未确认的消息（如启用重试可能导致消息顺序错乱）。
	- 权衡：降低吞吐量，但保证消息顺序性和可靠性。
5. **使用带回调的 `send()` 方法：`KafkaProducer.send(record, callback)`**
	- 作用：通过回调函数处理发送结果（成功或失败）。
	- 配置原因：
		- 可捕获发送异常（如网络错误、序列化失败）。
		- 在回调中执行重试或日志记录，确保消息不丢失。
6. **Callback 逻辑中显式关闭 Producer：`close(0)`**
	- 作用：在发生不可恢复错误时，立即关闭生产者。
	- 配置原因：
		- 避免继续发送可能失败的消息，防止数据丢失（如 Broker 永久不可用）。
		- `close(0)` 表示立即关闭，不等待未完成请求。
	- 注意：需谨慎使用，仅在极端场景下关闭生产者（如关键业务不允许任何丢失）。

#### Broker 配置

1. **`unclean.leader.election.enable = false`**
	- 作用：禁止非 ISR 副本（不同步的副本）参与 Leader 选举。
	- 配置原因：
		- 若允许非 ISR 副本成为 Leader，可能丢失已提交但未同步到该副本的消息。
		- 确保只有同步副本成为 Leader，避免数据丢失。
2. **`replication.factor >= 3`**
	- 作用：每个分区的副本数设置为大于 3。
		- 配置原因：
			- 提供高冗余，即使多个 Broker 宕机，分区仍可用。
			- 结合 `min.insync.replicas` 确保写入足够副本。
3. **`min.insync.replicas > 1`**
	- 作用：定义消息写入至少 2 个副本（包括 Leader）后才视为“已提交”。
	- 配置原因：
		- 若写入副本数不足，生产者会收到 `NotEnoughReplicasException`，触发重试。
		- 防止仅写入 Leader 后 Leader 宕机导致消息丢失。
		- **只有在 producer 端 acks 被设置成all或-1时，这个参数才有意义。**
4. **`replication.factor > min.insync.replicas`**
	- 配置原因：
		- 确保在部分副本不可用时（如维护、故障），仍有足够 ISR 副本满足 `min.insync.replicas`。
		- 例如：`replication.factor=3` 且 `min.insync.replicas=2`，允许 1 个副本离线不影响写入。

#### 消费者（Consumer）配置

1. **`enable.auto.commit = false`**
	- 作用：关闭消费者自动提交偏移量（offset）。
	- 配置原因：
		- 自动提交可能导致消息未处理完成但偏移量已提交，若消费者崩溃，消息会丢失。
		- 需手动调用 `commitSync()` 或 `commitAsync()`，确保消息处理完成后再提交偏移量。

### 消息压缩

数据压缩显著地降低了磁盘占用或带宽占用，从而有效地提升了 I/O密集型应用的性能。
不过引入压缩同时会消耗额外的 CPU时钟周期，因此**压缩是 I/O性能和 CPU资源的平衡（trade-off）**。

Kafka 压缩特性就是——producer 端压缩，broker 端保持，consumer 端解压缩。所谓的 broker 端保持是指 broker 端在通常情况下不会进行解压缩操作，它只是原样保存消息而已。
这里的“通常情况下”表示要满足一定的条件。如果有些前置条件不满足（比如需要进行消息格式的转换等），那么broker端就需要对消息进行解压缩然后再重新压缩。

如何调优 producer的压缩性能。

首先判断是否启用压缩的依据是 I/O资源消耗与CPU资源消耗的对比。
如果生产环境中的I/O资源非常紧张，比如producer程序消耗了大量的网络带宽或 broker端的磁盘占用率非常高，而 producer端的 CPU资源非常富裕，那么就可以考虑为producer开启消息压缩。
反之则不需要设置消息压缩以节省宝贵的CPU时钟周期。
其次，压缩的性能与 producer 端的 batch 大小息息相关。通常情况下我们可以认为 batch越大需要压缩的时间就越长。
batch大小越大，压缩时间就越长，不过时间的增长不是线性的，而是越来越平缓的。
如果发现压缩很慢，说明系统的瓶颈在用户主线程而不是 I/O发送线程，因此可以考虑增加多个用户线程同时发送消息，这样通常能显著地提升producer吞吐量。

## 第五章 - consumer开发

### consumer概览

Kafka消费者（consumer）是从Kafka读取数据的应用。若干个 consumer订阅Kafka集群中的若干个 topic并从 Kafka接收属于这些 topic的消息。

消费者组：
> Consumers label themselves with a consumer group name,and each record published to a topic is delivered to one consumer instance within each subscribing consumer group.
> 消费者使用一个消费者组名（即 group.id）来标记自己，topic 的每条消息都只会被发送到每个订阅它的消费者组的一个消费者实例上。

1. 一个 consumer group 可能有若干个 consumer实例（一个 group 只有一个实例也是允许的）。
2. 对于同一个 group 而言，topic 的每条消息只能被发送到 group 下的一个 consumer 实例上。
3. topic 消息可以被发送到多个group中。

前面说过 Kafka 同时支持基于队列和基于发布/订阅的两种消息引擎模型。事实上 Kafka 就是通过 consumer group 实现的对这两种模型的支持。

* 所有 consumer 实例都属于相同 group —— 实现基于队列的模型。每条消息只会被一个consumer实例处理。
* consumer 实例都属于不同 group —— 实现基于发布/订阅的模型。极端的情况是每个consumer 实例都设置完全不同的 group，这样 Kafka 消息就会被广播到所有 consumer实例上。

consumer group是用于实现高伸缩性、高容错性的consumer机制。
组内多个 consumer实例可以同时读取 Kafka消息，而且一旦有某个 consumer“挂”了，consumer group会立即将已崩溃 consumer负责的分区转交给其他 consumer来负责。
从而保证整个 group 可以继续工作，不会丢失数据——这个过程被称为重平衡（rebalance）。

### 位移（offset）

这里 offset 指代的是 consumer端的 offset，与分区日志中的 offset是不同的含义。
每个 consumer 实例都会为它消费的分区维护属于自己的位置信息来记录当前消费了多少条消息。被称为 位移（offset）。
很多消息引擎都把消费端的 offset 保存在服务器端（broker）。这样做的好处当然是实现简单，但会有以下3个方面的问题。

* broker从此变成了有状态的，增加了同步成本，影响伸缩性。
* 需要引入应答机制（acknowledgement）来确认消费成功。
* 由于要保存许多 consumer 的 offset，故必然引入复杂的数据结构，从而造成不必要的资源浪费。

Kafka 选择让 consumer group保存 offset，只需要简单地保存一个长整型数据。
同时 Kafka consumer 还引入了检查点机制（checkpointing）定期对offset进行持久化，从而简化了应答机制的实现。

**consumer客户端需要定期地向Kafka集群汇报自己消费数据的进度，这一过程被称为位移提交（offset commit）。**
位移提交这件事情对于 consumer 而言非常重要，它不仅表征了consumer 端的消费进度，同时也直接决定了 consumer 端的消费语义保证。

Kafka consumer 最开始会将位移提交到 Zookeeper，但这种方式并不好，ZooKeeper本质上只是一个协调服务组件，它并不适合作为位移信息的存储组件，毕竟频繁高并发的读/写操作并不是 ZooKeeper擅长的事情。
所以在新版本中consumer把位移提交到 Kafka 的一个内部 topic（__consumer_offsets）上。该topic是一个内部topic，通常不能直接操作该topic。

**消费者组重平衡（consumer group rebalance）本质上是一种协议，规定了一个 consumer group下所有 consumer如何达成一致来分配订阅 topic的所有分区。**
假设我们有一个 consumer group，它有20个 consumer实例。该 group订阅了一个具有100个分区的 topic。
那么正常情况下，consumer group平均会为每个 consumer分配5个分区，即每个 consumer负责读取5个分区的数据。这个分配过程就被称作rebalance。

### 消息轮询

Kafka的 consumer是用来读取消息的，而且要能够同时读取多个 topic的多个分区的消息。
若要实现并行的消息读取，一种方法是使用多线程的方式，为每个要读取的分区都创建一个专有的线程去消费；
另一种方法是采用类似于 Linux I/O模型的 poll或 select等，使用一个线程来同时管理多个 Socket 连接，即同时与多个 broker 通信实现消息的并行读取。

一旦 consumer 订阅了 topic，所有的消费逻辑包括 coordinator 的协调、消费者组的rebalance以及数据的获取都会在主逻辑poll方法的一次调用中被执行。
这样用户很容易使用一个线程来管理所有的consumer I/O操作。

consumer 订阅 topic 之后通常以事件循环的方式来获取订阅方案并开启消息读取。
仅仅是写一个循环，然后重复性地调用poll方法。剩下所有的工作都交给poll方法完成。每次poll方法返回的都是订阅分区上的一组消息。当然如果某些分区没有准备好，某次 poll 返回的就是空的消息集合。
poll方法根据当前consumer的消费位移返回消息集合。当poll首次被调用时，新的消费者组会被创建并根据对应的位移重设策略（auto.offset.reset）来设定消费者组的位移。
一旦consumer 开始提交位移，每个后续的 rebalance 完成后都会将位置设置为上次已提交的位移。传递给 poll 方法的超时设定参数用于控制 consumer 等待消息的最大阻塞时间。
由于某些原因，broker端有时候无法立即满足consumer端的获取请求（比如consumer要求至少一次获取1MB的数据，但 broker 端无法立即全部给出），那么此时 consumer 端将会阻塞以等待数据不断累积并最终满足 consumer需求。
如果用户不想让 consumer一直处于阻塞状态，则需要给定一个超时时间。因此poll方法返回满足以下任意一个条件即可返回。

* 要么获取了足够多的可用数据。
* 要么等待时间超过了指定的超时设置。

### 位移管理

offset 对于 consumer 非常重要，因为它是实现消息交付语义保证（message delivery semantic） 的基石。常见的3种消息交付语义保证如下。

* 最多一次（at most once）处理语义：消息可能丢失，但不会被重复处理。
* 最少一次（at least once）处理语义：消息不会丢失，但可能被处理多次。
* 精确一次（exactly once）处理语义：消息一定会被处理且只会被处理一次。

若consumer在消息消费之前就提交位移，那么便可以实现 at most once——因为若consumer 在提交位移与消息消费之间崩溃，则 consumer 重启后会从新的 offset 位置开始消费，前面的那条消息就丢失了。
若提交位移在消息消费之后，则可实现 at least once 语义。

除了offset，还有其他位置信息：

* 上次提交位移（last committed offset）:consumer最近一次提交的offset值。
* 当前位置（current position）:consumer已读取但尚未提交时的位置。
* 水位（watermark）：也被称为高水位（high watermark），严格来说它不属于consumer 管理的范围，而是属于分区日志的概念。对于处于水位之下的所有消息，consumer 都是可以读取的，consumer 无法读取水位以上的消息。
* 日志终端位移（Log End Offset,LEO）：也被称为日志最新位移。同样不属于consumer 范畴，而是属于分区日志管辖。它表示了某个分区副本当前保存消息对应的最大的位移值。值得注意的是，正常情况下 LEO不会比水位值小。事实上，只有分区所有副本都保存了某条消息，该分区的leader副本才会向上移动水位值。

**consumer最多只能读取到水位值标记的消息，而不能读取尚未完全被“写入成功”的消息，即位于水位值之上的消息。**

consumer 会在 Kafka 集群的所有 broker 中选择一个 broker 作为 consumer group 的coordinator，用于实现组成员管理、消费分配方案制定以及提交位移等。
当消费者组首次启动时，由于没有初始的位移信息，coordinator 必须为其确定初始位移值，这就是 consumer 参数 auto.offset.reset的作用。
通常情况下，consumer 要么从最早的位移开始读取，要么从最新的位移开始读取。

当 consumer运行了一段时间之后，它必须要提交自己的位移值。
如果 consumer崩溃或被关闭，它负责的分区就会被分配给其他 consumer，因此一定要在其他 consumer 读取这些分区前就做好位移提交工作，否则会出现消息的重复消费。

consumer 提交位移的主要机制是通过向所属的 coordinator 发送位移提交请求来实现的。每个位移提交请求都会往 __consumer_offsets 对应分区上追加写入一条消息。
消息的 key 是group.id、topic和分区的元组，而 value就是位移值。如果 consumer为同一个 group的同一个topic 分区提交了多次位移，那么 __consumer_offsets 对应的分区上就会有若干条 key 相同但value 不同的消息，但显然我们只关心最新一次提交的那条消息。
从某种程度来说，只有最新提交的位移值是有效的，其他消息包含的位移值其实都已经过期了。Kafka通过压实（compact）策略来处理这种消息使用模式。

默认情况下，consumer是自动提交位移的，自动提交间隔是5秒。这就是说若不做特定的设置，consumer程序在后台自动提交位移。通过设置`auto.commit.interval.ms`参数可以控制自动提交的间隔。

|      | 使用方法                                                      | 优势          | 劣势                   | 交付语义保证                            | 使用场景                           |
|------|-----------------------------------------------------------|-------------|----------------------|-----------------------------------|--------------------------------|
| 自动提交 | 默认不用配置或显式设置enable.auto.commit=ture                        | 开发成本低，简单易用  | 无法实现精确控制，位移提交失败后不易处理 | 可能造成消息丢失，最多实现“最少一次”处理语义           | 对消息交付语义无需求，容忍一定的消息丢失           |
| 手动提交 | 设置enable.auto.commit=false;手动调用commitSync或commitAsync提交位移 | 可精确控制位移提交行为 | 额外的开发成本，须自行处理位移提交    | 易实现“最少一次”处理语义，依赖外部状态可实现“精确一次”处理语义 | 消息处理逻辑重，不允许消息丢失，至少要求“最少一次”处理语义 |

手动提交位移 API 进一步细分为同步手动提交和异步手动提交，即 commitSync 和commitAsync 方法。
如果调用的是 commitSync，用户程序会等待位移提交结束才执行下一条语句命令。
相反地，若是调用 commitAsync，则是一个异步非阻塞调用。consumer在后续 poll调用时轮询该位移提交的结果。
特别注意的是，这里的异步提交位移不是指 consumer 使用单独的线程进行位移提交。实际上 consumer 依然会在用户主线程的 poll 方法中不断轮询这次异步提交的结果。只是该提交发起时此方法是不会阻塞的，因而被称为异步提交。

### 重平衡（rebalance）

consumer group的rebalance本质上是一组协议，它规定了一个consumer group是如何达成一致来分配订阅 topic的所有分区的。
假设某个组下有20个 consumer实例，该组订阅了一个有着100个分区的 topic。正常情况下，Kafka会为每个 consumer平均分配5个分区。这个分配过程就被称为 rebalance。
当 consumer成功地执行 rebalance后，组订阅 topic的每个分区只会分配给组内的一个consumer实例。

#### rebalance 触发条件

组rebalance触发的条件有以下3个。

* 组成员发生变更，比如新 consumer 加入组，或已有 consumer 主动离开组，再或是已有consumer崩溃时则触发rebalance。
* 组订阅 topic 数发生变更，比如使用基于正则表达式的订阅，当匹配正则表达式的新topic被创建时则会触发rebalance。
* 组订阅 topic 的分区数发生变更，比如使用命令行脚本增加了订阅topic的分区数。

如果一个 group 下的 consumer 处理消息的逻辑过重，并且事件的处理时间波动很大，非常不稳定。会导致 coordinator 会经常性地认为某个 consumer 已经挂掉，引发 rebalance。
这时需要仔细调优consumer 参数 request.timeout.ms、max.poll.records 和 max.poll.interval.ms，以避免不必要的rebalance出现。

#### rebalance 分区分配

在 rebalance时 group下所有的 consumer都会协调在一起共同参与分区分配。
Kafka 新版本 consumer 默认提供了3种分配策略，分别是 range 策略、round-robin策略和sticky策略。

range策略主要是基于范围的思想。它将单个 topic 的所有分区按照顺序排列，然后把这些分区划分成固定大小的分区段并依次分配给每个 consumer。
round-robin策略则会把所有 topic的所有分区顺序摆开，然后轮询式地分配给各个consumer。
sticky策略有效地避免了上述两种策略完全无视历史分配方案的缺陷，采用了“有黏性”的策略对所有 consumer 实例进行分配，可以规避极端情况下的数据倾斜并且在两次rebalance间最大限度地维持了之前的分配方案。

通常意义上认为，如果 group 下所有 consumer 实例的订阅是相同，那么使用 round-robin会带来更公平的分配方案，否则使用range策略的效果更好。
新版本 consumer 默认的分配策略是 range。用户根据consumer参数`partition.assignment.strategy`来进行设置。
另外Kafka支持自定义的分配策略，用户可以创建自己的consumer分配器（assignor）。

#### rebalance generation

某个consumer group可以执行任意次rebalance。为了更好地隔离每次rebalance上的数据，新版本 consumer设计了 rebalance generation用于标识某次 rebalance。
generation这个词类似于JVM分代垃圾收集器中“分代”（严格来说，JVM GC使用的是 generational）的概念。
在consumer中它是一个整数，通常从0开始。Kafka引入consumer generation主要是为了保护consumer group的，特别是防止无效offset提交。
比如上一届的 consumer成员由于某些原因延迟提交了 offset，但 rebalance之后该 group产生了新一届的group成员，而这次延迟的offset提交携带的是旧的generation信息，因此这次提交会被consumer group拒绝。

#### rebalance协议

rebalance 本质上是一组协议。group 与 coordinator 共同使用这组协议完成group的rebalance。

* JoinGroup请求：consumer请求加入组。
* SyncGroup请求：group leader把分配方案同步更新到组内所有成员中。
* Heartbeat请求：consumer定期向coordinator汇报心跳表明自己依然存活。
* LeaveGroup请求：consumer主动通知coordinator该consumer即将离组。
* DescribeGroup 请求：查看组的所有信息，包括成员信息、协议信息、分配方案以及订阅信息等。该请求类型主要供管理员使用。coordinator不使用该请求执行rebalance。

#### rebalance流程

consumer group在执行rebalance之前必须首先确定coordinator所在的broker，并创建与该broker 相互通信的 Socket 连接。
确定 coordinator 的算法与确定 offset 被提交到__consumer_offsets目标分区的算法是相同的。算法如下。

* 计算 Math.abs（groupID.hashCode） % offsets.topic.num.partitions参数值（默认是 50），假设是10。
* 寻找__consumer_offsets分区10的leader副本所在的broker，该broker即为这个group的coordinator。
  成功连接 coordinator之后便可以执行 rebalance操作。目前 rebalance主要分为两步：加入组和同步更新分配方案。
* **加入组**：这一步中组内所有 consumer（即 group.id 相同的所有 consumer 实例）向coordinator发送 JoinGroup请求。
  当收集全 JoinGroup请求后，coordinator从中选择一个consumer担任group的leader，并把所有成员信息以及它们的订阅信息发送给leader。
  特别需要注意的是，group 的 leader 和 coordinator 不是一个概念。leader 是某个consumer 实例，coordinator 通常是 Kafka 集群中的一个 broker。另外 leader 而非coordinator负责为整个group的所有成员制定分配方案。
* **同步更新分配方案**：这一步中 leader 开始制定分配方案，即根据前面提到的分配策略决定每个consumer都负责哪些topic的哪些分区。
  一旦分配完成，leader会把这个分配方案封装进 SyncGroup 请求并发送给 coordinator。比较有意思的是，组内所有成员都会发送 SyncGroup请求，不过只有 leader发送的 SyncGroup请求中包含了分配方案。
  coordinator 接收到分配方案后把属于每个 consumer 的方案单独抽取出来作为SyncGroup请求的response返还给各自的consumer。

**consumer group分配方案是在 consumer端执行的。** Kafka将这个权力下放给客户端主要是因为这样做可以有更好的灵活性。
比如在这种机制下用户可以自行实现类似于 Hadoop 那样的机架感知（rack-aware）分配方案。同一个机架上的分区数据被分配给相同机架上的 consumer，减少网络传输的开销。
而且，即使以后分区策略发生了变更，也只需要重启 consumer 应用即可，不必重启Kafka服务器。

#### rebalance监听器

新版本 consumer 默认把位移提交到__consumer_offsets 中。其实，Kafka 也支持用户把位移提交到外部存储中，比如数据库中。
若要实现这个功能，用户就必须使用 rebalance监听器。使用 rebalance监听器的前提是用户使用consumer group。如果使用的是独立consumer或是直接手动分配分区，那么rebalance监听器是无效的。

rebalance 监听器有一个主要的接口回调类 ConsumerRebalanceListener，里面就两个方法onPartitionsRevoked和onPartitionAssigned。
在 coordinator 开启新一轮 rebalance 前 onPartitionsRevoked 方法会被调用，而 rebalance 完成后会调用 onPartitionsAssigned 方法。

> 鉴于 consumer 通常都要求 rebalance 在很短的时间内完成，千万不要在 rebalance监听器的两个方法中放入执行时间很长的逻辑，特别是一些阻塞方法，如各种阻塞队列的take或poll等。

### 解序列化

解序列化（deserializer）或称反序列化与前面的序列化（serializer）是互逆的操作。
Kafka consumer从broker端获取消息的格式是字节数组，consumer需要把它还原回指定的对象类型，而这个对象类型通常都是与序列化对象类型一致的。
比如 serializer 把一个字符串序列化成字节数组，consumer使用对应的deserializer把字节数组还原回字符串。

### 多线程消费实例

KafkaConsumer 是非线程安全的。它和 KafkaProducer 不同，后者是线程安全的。

实现多线程消费consumer的一种方式是创建多个线程来消费 topic 数据。每个线程都会创建专属于该线程的KafkaConsumer实例。
另一种方式是将消息的获取与消息的处理解耦，把后者放入单独的工作者线程中，即所谓的 worker线程中。同时在全局维护一个或若干个 consumer 实例执行消息获取任务。

|                            | 优点                                         | 缺点                                                                                 |
|----------------------------|--------------------------------------------|------------------------------------------------------------------------------------|
| 方法1（每个线程维护专属KafkaConsumer) | 实现简单；速度较快，因为无线程间交互开销：方便位移管理；易于维护分区间的消息消费顺序 | Socket连接开销大；consumer数受限于topic分区数，扩展性差；broker端处理负载高（因为发往broker的请求数多）；rebalance可能性增大 |
| 方法2（全局consumer+多worker线程）  | 消息获取与处理解耦；可独立扩展consumer数和worker数，伸缩性好      | 实现负载；难于维护分区内的消息顺序；处理链路变长，导致位移管理困难；worker线程异常可能导致消费数据丢失                             |

### 独立consumer

group自动帮用户执行分区分配和 rebalance。对于需要有多个 consumer 共同读取某个 topic 的需求来说，使用group 是非常方便的。
但有的时候用户依然有精确控制消费的需求，比如严格控制某个consumer固定地消费哪些分区。比如：

* 如果进程自己维护分区的状态，那么它就可以固定消费某些分区而不用担心消费状态丢失的问题。
* 如果进程本身已经是高可用且能够自动重启恢复错误（比如使用YARN和Mesos等容器调度框架），那么它就不需要让Kafka来帮它完成错误检测和状态恢复。

以上两种情况中 consumer group 都是无用武之地的，取而代之的是被称为独立 consumer （standalone consumer）的角色。
standalone consumer 间彼此独立工作互不干扰。任何一个consumer崩溃都不影响其他standalone consumer的工作。

## 第六章 - Kafka设计原理



