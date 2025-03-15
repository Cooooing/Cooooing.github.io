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

## 第六章 - Kafka 设计原理



