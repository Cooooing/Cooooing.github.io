---
title: Redis笔记
date: 2022-05-07 21:38:10
tags:
    - Redis
    - 数据库
categories:
    - 笔记
---
## 关于Redis

[Redis官网](https://redis.io/)
[Redis百度百科](https://baike.baidu.com/item/Redis/6549233)
REmote DIctionary Server(Redis) 是一个由 Salvatore Sanfilippo 写的 **key-value** 存储系统，是跨平台的非关系型数据库。
Redis 是一个开源的使用 ANSI C 语言编写、遵守 BSD 协议、**支持网络、可基于内存、分布式、可选持久性的键值对(Key-Value)存储数据库**，并提供多种语言的 API。  
Redis 通常被称为数据结构服务器，因为值（value）可以是字符串(String)、哈希(Hash)、列表(list)、集合(sets)和有序集合(sorted sets)等类型。  

使用Redis是为了解决多次读写数据库引发的性能问题。因为Redis是**基于内存的数据库**，所以它的性能十分优越，读的速度是110000次/s,写的速度是81000次/s。JavaWeb通常使用它存储**缓存**用的数据，以及需要高速读/写的场合，以减少对基于硬盘的数据库的访问次数。

## Redis中的数据结构及操作命令

### Redis中的数据结构

| 数据类型                      | 格式            | 例子                                            |
|---------------------------|---------------|-----------------------------------------------|
| string(字符串)               | 单key:单value   | name:zhangsan                                 |
| list(列表,按插入顺序)            | 单key:多有序value | contacts:13952900000,xxx,xxx                  |
| set(集合,无序且不重复,string类型)   | 单key:多无序value | city:beijing shanghai shenzhen                |
| hash(哈希,适合存储对象)           | 单key:对象(属性:值) | student:id:1,name:zhangsan,age:20             |
| zset(有序集合,通过double类型分数排序) | 单key:多有序value | city:1000 beijing,1500 shanghai,2000 shenzhen |

### 关于键(key)的操作命令

1. 查看redis中的key: **keys pattern**(查找符合给定模式pattern的key)
   * keys *: 查看redis中所有的key(*匹配零或多个字符)
   * keys h?o: 查看redis中以h开头，o结尾且中间只有一个字符的key(?匹配一个字符)
   * keys h[abc]llo: 查看redis中以h开头，llo结尾，且中间为abc中一个的key([]匹配[]中的一个字符)
2. 判断key在redis中是否存在
   * **exists key**(存在返回1，不存在返回0)
   * **exists key [key key key]** (返回值为存在key的数量)
3. 移动指定key到指定的redis实例: **move key index**
   * move k1 1
4. 查看指定key的剩余生存时间: **ttl key**(key未设置生存时间，返回-1；key不存在，返回-2)
   * ttl k1
5. 设置key最大生命时间: **expire key seconds**(单位秒)
   * expire k2 20
6. 查看指定key的数据类型: **type key**
   * type k1
7. 重命名key: **rename key newkey**
   * rename k1 k2
8. 删除指定key: **del key [key key key]**(返回值是实际删除key的数量)
   * del k1 k2

### 关于string类型数据的操作命令

1. 将string类型数据设置到redis中: **set key value**
   * set name zhangsan
   * set age 20
2. 从redis中获取string类型数据: **get key**
   * get name
   * \> zhangsan
   * get age
   * \> 20
3. 追加字符串: **append key value**(返回值为追加后字符串长度；如果key不存在，则创建并赋值)
   * set phone 2333333
   * append phone 8888
   * \> 23333338888
4. 获取字符串长度: **strlen key**
   * strlen phone
   * \> 5
5. 将字符串数值进行加1运算: **incr key**  
(返回加1运算后的数据;key不存在，设置一个初始值为0的key，在进行incr运算；key的value不为数值，报错)
6. 将字符串数值进行减1运算: **decr key**  
(返回减1运算后的数据;key不存在，设置一个初始值为0的key，在进行decr运算；key的value不为数值，报错)
7. 将字符串数值进行加offset运算: **incrby key offset**  
(返回加offset运算后的数据;key不存在，设置一个初始值为0的key，在进行incrby运算；key的value不为数值，报错)
8. 将字符串数值进行减offset运算: **decrby key offset**  
(返回减offset运算后的数据;key不存在，设置一个初始值为0的key，在进行decrby运算；key的value不为数值，报错)
9. 获取字符串key中从startIndex到endIndex的子串: **getrange key startIndex endIndex**(闭区间，下标也可为负数)
   * set k1 zhangsan
   * getrange k1 2 5
   * \> angs
   * getrange k1 0 -1
   * \> zhangsan
10. 用value覆盖从startIndex开始的字符串: **setrange key startIndex value**
    * set k1 zhangsan
    * setrange k1 5 233
    * \> zhang233
    * setrange k1 5 a
    * \> zhanga33
11. 设置string数据同时，设置它的最大生命周期: **setex key seconds value**
    * setex k1 20 zhangsan
12. 设置string数据到redis中，不存在则设置；存在则放弃: **setnx key value**
    * setnx k1 20
13. 批量设置string数据到redis中: **mset key1 value1 key2 value2 ...**
14. 批量获取string数据: **mget key1 key2 ...**

### 关于list类型数据的操作命令

单key-多有序value
多个value之间有顺序(插入顺序)，最左侧是表头，最右侧表尾。
每个元素都有下标，表头元素下标是0。下标可以为负数

1. 将一个或多个值依次插入列表的表头: **lpush key value [value value ...]**
   * lpush list1 1 2 3
2. 获取指定列表中指定下标区间的元素: **lrange key startIndex endIndex**
   * lrange list1 0 2
   * \>3
   * \>2
   * \>1
3. 将一个或多个值依次插入列表的表尾: **rpush key value [value value ...]**
   * rpush list2 1 2 3
   * lrange list2 0 2
   * \>1
   * \>2
   * \>3
4. 从指定列表移除并返回表头: **lpop key**
5. 从指定列表移除并返回表尾: **rpop key**
6. 获取指定列表中指定下标的元素: **lindex key index**
   * lindex list1 1
   * \>2
7. 获取指定列表的长度: llen key
   * llen list1
   * \>3
8. 根据count值移除指定列表中跟value相等的数据: **lrem key count value**  
count>0:从列表的左侧移除count个跟value相等的数据；  
count<0:从列表的右侧移除count个跟value相等的数据；
count=0:从列表移除所有跟value相等的数据。
9. 截取指定列表指定区间组成新的列表，并赋值给key: **ltrim key startIndex endIndex**
10. 将指定列表指定下标元素设置为指定值: lset key index value
11. 将value插入到指定列表中位于pivot元素之前/之后的位置: linsert key before/after pivot value

### 关于set类型数据的操作命令

单key-多无序value
无序且不重复，所以元素没有下标，直接操作数据。

1. 将一个或多个元素添加到指定集合: **sadd key value [value value ...]**  
如果元素已经存在，则会忽略。返回成功加入的元素个数。
   * sadd set1 a b c a
2. 获取指定集合中的所有元素: smembers key
   * smembers set1
   * \>a
   * \>c
   * \>b
3. 判断指定元素在指定集合中是否存在: **sismember key member**  
存在返回1，不存在返回0。
4. 获取指定集合的长度: **scard key**
5. 移除指定集合中的一个或多个元素: **srem key member [member member ...]**  
不存在的元素会被忽略  
返回成功移除的元素个数
6. 随机获取指定集合中的一个或多个元素: **srandmember key [count]**  
count>0 随机获取的多个元素不能重复  
count<0 随机获取的多个元素之间可能重复
7. 从指定集合中随机移除一个或多个元素: **spop key [count]**
8. 将指定集合中指定元素移动到另一个集合: **smove source dest member**
   * smove set1 set2 a
9. 获取第一个集合中有，但其他集合中没有的元素组成新的集合(差集): **sdiff key key [key key ...]**
10. 获取所有指定集合中都有的元素组成新的集合(交集): **sinter key key [key key ...]**
11. 获取所有指定集合中所有的元素组成新的集合(并集): **sunion key key [key key ...]**

### 关于hash类型数据的操作命令

单key:field-value field-value ...
hash是string类型的key和value的映射表，value是一系列的键值对，适合存储对象

1. 将一个或多个field-value对设置到哈希表中: **hset key field1 value1 [field2 value2 ...]**
   * hset stu1 id 0001
   * hset stu2 id 0002 name zhangsan
2. 获取指定哈希表中指定的field的值: **hget key field**
   * hget stu1 id
   * \>0001
3. ~~批量将多个field-value对设置到哈希表中: **hmset key field1 value1 [field2 value2 ...]**~~
4. 批量获取指定哈希表在的field值: **hmget key field1 [field2 field3 ...]**
5. 获取指定哈希表中所有的field和value: **hgetall key**
6. 从指定哈希表中删除一个或多个field: **hdel key field1 [field1 field2 ...]**
7. 获取指定哈希表中所有的field个数: **hlen key**
8. 判断指定哈希表中是否存在某个field: **hexists key field**
9. 获取指定哈希表中所有的field列表: **hkeys key**
10. 获取指定哈希表中所有的value列表: **hvals key**
11. 对指定哈希表中指定的field值进行整数加法运算: **hincrby key field int**
12. 对指定哈希表中指定的field值进行浮点数加法运算: **hincrbyfloat key field float**
13. 将一个field-value对设置到指定哈希表中: **hsetnx stu1 age 30**  
当key-field已经存在，则放弃设置

### 关于zset类型数据的操作命令

有序集合，不允许重复元素。
但zset集合中，每个元素会关联一个分数，redis根据分数对元素进行排序，分数可以重复。
zset中每个元素都有顺序，所有每个元素也有下标。。

1. 将一个或多个member及其score值加入有序集合: **zadd key score member [score member ...]**  
如果元素已经存在，则会覆盖其分数
   * zadd zset1 1 a
2. 获取指定有序集合中指定下标区间的元素: **zrange key startIndex endIndex [withscores]**  
withscores 是否显示分数
3. 获取指定有序集合中指定分数区间(闭区间)的元素: **zrangebysorce key min max [withscores]**
4. 删除指定有序集合中的一个或多个元素: **zrem key member [member ...]**
5. 获取指定有序集合中所有元素的个数: **zcard key**
6. 获取指定有序集合中分数在指定区间内的元素个数: **zcount key min max**
7. 获取指定有序集合中指定元素的排名(从0开始): **zrank key member**
8. 获取指定有序集合中指定元素的分数: **zscore key member**
9. 获取指定有序集合中指定元素的排名(按分数从小到大的排名): **zrevrank key member**

### 命令小结

> 上面的命令是部分常用的命令，写到这里感觉不如去看文档，不过写一遍也算是加深印象。  
> [菜鸟教程Redis](https://www.runoob.com/redis/redis-tutorial.html)  

## Redis的配置文件

redis根目录下提供redis.conf配置文件  
如果不使用配置文件，redis按默认参数运行。如果使用配置文件，在启动redis服务时，必须指定所使用的配置文件。  

### 关于网络的配置

1. port：指定redis服务所使用的端口号，默认使用6379
2. bind：配置客户端连接redis服务时，所能使用的ip地址，默认可以使用redis服务所在主机上任意一个ip都可以；一般情况会配置一个真实ip。  
   * 如果配置了port和bind，则客户端连接redis服务时，必须指定端口和ip：  
   redis-cli -h 192.268.11.128 -p 6380  
   redis-cli -h 192.268.11.128 -p 6380 shutdown  
3. tcp-keepalive：TCP连接保活策略。单位秒，每过多少秒向连接空闲的客户端发送一个ACK请求，以检查客户端是否挂掉，对于无响应的客户端会关闭连接。如果设置为0，则不会进行保活检测。  

### 常规配置

1. loglevel：配置日志级别，开发阶段可以设置成debug，生产阶段通常设置为notice或waring。
2. logfile：指定日志文件。redis运行过程中会输出日志信息；默认会输出到控制台。
3. databases：配置redis服务创建的数据库实例个数，默认16个。

### 安全配置

1. requirepass：配置redis的访问密码。默认不配置密码。此参数必须在protected-mode=yes(安全模式)是才起作用。

### RDB配置

1. save <seconds> <changes>：配置复合的快照触发条件，即redis在seconds秒内key改变了changes次，会将快照内数据保存到磁盘一次。默认策略是：
    * 1分钟内改变1万次
    * 或5分钟内改变10次
    * 或15分钟内改变1次
    * 如果要禁用redis的持久化功能，吧所有的save配置注释即可。
2. stop-writes-on-bgsave-erroe：在bgsave快照操作出错时停止写入磁盘，以保证数据一致性。如果出错时要继续写入，配置为no。
3. rdbcompression：设置对存储到磁盘的快照是否压缩。yes会采用LZF算法进行压缩，no关闭此功能，可减少CPU消耗。
4. rdbchecksum：快照存储后，可使用CRC64算法进行数据校验，会消耗一定性能，no关闭此功能。
5. sdbfilename：持久化数据生成的文件名。默认为dump.rdb
6. dir：持久化数据生成文件的保存目录。默认./即redis启动目录

### AOF配置

1. appendonly：配置是否开启AOF，yes表示开启，no表示关闭。默认no
2. appendfilename：AOF保存的文件名
3. appendfsync：AOF异步持久化策略
   * always：同步持久化，每次发生数据变化立刻写入磁盘。性能差但数据安全。
   * everysec：每秒异步记录一次。默认。
   * no：不及时同步，由操作系统决定何时同步。
4. no-appendfysnc-on-rewrite：重写时是否可以运用appendsync，默认no，可以保证数据安全性。
5. auto-aof-rewrite-percentage：设置重写的基准百分比。
6. auto-aof-rewrite-min-size：设置重写的基准值。

## Redis的持久化

redis是内存数据库，数据存储在内存中，虽然加快了读取速度，但也对数据安全性产生新的问题。当服务器宕机后，redis数据库中所有数据会全部丢失，所以redis提供了持久化功能——RDB和AOF。

### RDB策略

在指定时间间隔内，redis服务执行指定次数的写操作，会自动触发一次持久化操作。  
RDB策略是redis默认的持久化策略，在redis服务开启时，这种持久化策略默认开启。

### AOF策略

采用操作日志来记录进行的每一次操作，每次redis启动时，都会重新执行一遍日志中的命令。  
效率低下，redis默认不开启。作为RDB策略的补充。

### 持久化策略小结

> 根据数据的特点来决定使用哪种策略，一般RDB足够。redis主要做缓存，数据在关系型数据库中有备份。

## Redis的事务

事务：把一组数据库放在一起执行，保证操作的原子性，要么同时成功，要么同时失败。
Redis的事务：允许把一组redis命令放在一起执行，把命令序列化，然后一起执行，保证部分原子性。

1. multi：用来标记一个事务的开始。
   * 压入事务队列
   * multi
   * set k1 v1
   * set k2 v2 
   * ...
2. exec：用来执行事务队列中的所有命令。
   * exec
3. redis的事务只能保证部分原子性：
   * 如果一组命令中，在压入事务队列过程中发生错误，则本事务中所有命令都不执行，保证事务原子性。
   * 如果一组命令中，艾压入队列过程正常，但在执行事务队列命令时发生错误，则只会影响发生错误的命令，不会影响其他命令，不能保证事务的原子性。
4. discard：清除所有已经压入队列中的命令，并且结束整个事务。
   * multi
   * set k1 v1
   * set k2 v2
   * discard
5. watch：监控某一个键，当事务在执行过程中，此键代码的值发生变化，则本事务放弃执行；否则，正常执行。
6. unwatch：放弃监控某一键

> 事务小结：  
> 1.单独的隔离操作：事务中的所有命令会序列化、顺序地执行。执行过程中不会被其他客户端的命令请求打断，除非是用watch进行监视。
> 2.不保证事务的原子性：同一事务如果某一命令执行失败，其他命令仍可能被继续执行，redis事务没有回滚。

## Redis消息的发布与订阅(了解)

redis客户端订阅频道，消息的发布者往频道上发布消息，所有订阅此频道的客户端都能够接收到消息。

1. subscribe：订阅一个或多个频道的消息。
   * subscribe ch1 ch2 ch3
2. publish：将消息发布到指定频道
   * publish ch1 hello
3. psubscribe：订阅一个或多个频道的消息，频道名支持通配符。

## Redis的主从复制

主少从多，主写从读，读写分离，主写同步复制到从。

搭建一主二从的redis集群：
1. 搭建三台redis服务：使用一台机器，三个不同端口模拟
   * 修改配置文件(bind、port等),以redis6379.conf为例
   * bind 127.0.0.1
   * port 6379
   * pidfile /var/run/redis_6379.pid
   * logfile "6379.log"
   * dbfilename dump6379.rdb
   * 启动服务
   * redis-server redis6379.cond &
   * redis-server redis6380.cond &
   * redis-server redis6381.cond &
2. 连接到redis服务
   * redis-cli -h 127.0.0.1 -p 6379
   * redis-cli -h 127.0.0.1 -p 6380
   * redis-cli -h 127.0.0.1 -p 6381
3. 查看三台redis服务在集群中的主从角色：
   * info replication
   * 默认情况下，所有的redis服务都是主机，既能读也能写，但都没有从机。
4. 设置主从关系：设从不设主
   * 在6380上执行：slaveof 127.0.0.1 6379
   * 在6381上执行：slaveof 127.0.0.1 6379
5. 全量复制：一旦主从关系确定，会自动把主机上已有的数据同步复制到从库
6. 增量复制：主库写数据会自动同步到从库
7. 主写从读，读写分离：
   * 在从机上进行写操作会报错
8. 主机宕机、从机原地待命：
   * 从机可以继续读，但数据不会再更新。
9. 主机恢复、一切恢复正常
10. 从机宕机、主机少一个从机，其他从机不变。
11. 从机恢复、需**重新设置主从关系**。
12. 从机上位：
    * 主机宕机、从机原地待命
    * 从机断开原来的主从关系
    * 在6380上执行：slaveof no one
    * 重新设置主从关系
    * 在6381上执行：slaveof 127.0.0.1 6380
13. 原主机恢复
    * 在6379上执行：slaveof 127.0.0.1 6379
    * 让6379变为6380的从机
    * 或者在6379上执行：slaveof 127.0.0.1 6381
    * 让6379成为6381的从机，此时6381既是主机又是从机，但他不能读。

> 小结：  
> 一台主机配置多台从机，一台从机也可以配置多台从机，从而形成一个庞大的集群。减轻一台主机的压力，但是增加了服务间的延迟。

## Redis的哨兵模式

主机宕机、从机上位的自动版

1. 搭建一主二从的redis集群(见上文)
2. 提供哨兵的配置文件：
   * 在redis安装目录下下创建配置文件：redis_sentinel.conf
   * 写入 sentinel monitor dc-redis 127.0.0.1 6379 1
3. 启动哨兵服务：redis-sentinel redis_sentinel.conf
4. 主机宕机，哨兵自动选择从机上位
5. 原主机恢复，自动从属于新主机

> 哨兵小结
> 可以设置多个哨兵。即每个redis服务都可以设置一个哨兵。
> 哨兵模式三大任务：监控、提醒、自动故障迁移

## Jedis操作Redis

使用Redis官方推荐的Jedis，在Java应用中操作Redis。操作Redis的命令在jedis中以方法形式出现。  
[Jedis文档](https://ppg007.github.io/redis/docs/jedis.html)

maven配置
~~~xml
    <dependency>
      <groupId>redis.clients</groupId>
      <artifactId>jedis</artifactId>
      <version>4.2.2</version>
    </dependency>
~~~
示例java程序
~~~java
package org.example;

import redis.clients.jedis.Jedis;

import java.util.Set;

public class Main {
    public static void main(String[] args) {
        //连接redis
        Jedis jedis = new Jedis("127.0.0.1", 6379);
        //使用jedis对象操作redis服务
        Set<String> ret = jedis.keys("*");
        System.out.println(ret);
    }
}
~~~
输出：[]

## Jedis中连接池的使用

工具类
~~~Java
package org.example;

import redis.clients.jedis.JedisPool;
import redis.clients.jedis.JedisPoolConfig;

public class RedisUtils {
    private static JedisPool pool;

    //创建JedisPool对象
    public static JedisPool open(String ip, int port) {
        if (pool == null) {
            //创建JedisPool
            //创建JedisPoolConfig，给config设置连接池的参数，使用config对象创建JedisPool
            JedisPoolConfig config = new JedisPoolConfig();
            //给config设置连接池的参数

            //设置最大线程数，一个线程就是一个Jedis
            config.setMaxTotal(20);
            //设置最大空闲数
            config.setMaxIdle(2);
            //设置检查项为true，表示从线程池中获取的对象一定是经过检查可用的
            config.setTestOnBorrow(true);
            //创建Pool对象
            /*
             * poolConfig:配置器JedisPoolConfig
             * host:redis所在linux的ip
             * port:redis的端口
             * timeout:链接redis超时，毫秒值
             * password:链接redis的访问密码
             */
            pool = new JedisPool(config, ip, port, 6000);
        }
        return pool;
    }

    //关闭Pool对象
    public static void close() {
        if (pool != null) {
            pool.close();
        }
    }
}
~~~
测试类
~~~java
package org.example;

import redis.clients.jedis.Jedis;
import redis.clients.jedis.JedisPool;

import java.util.Set;

public class Main {
    public static void main(String[] args) {
        String host = "127.0.0.1";
        int port = 6379;
        //创建JedisPool对象，从JedisPool中获取Jedis
        JedisPool pool = null;
        Jedis jedis = null;
        try {
            pool = RedisUtils.open(host, port);
            //从pool中获取Jedis
            jedis = pool.getResource();

            Set<String> ret = jedis.keys("*");
            System.out.println(ret);
        } finally {
            //关闭Jedis对象，把Pool中获取的Jedis放回Pool，供其他请求使用。
            if (jedis != null) {
                jedis.close();
            }
        }
    }
}
~~~
输出：[]

## Redis客户端工具——Redis Desktop Manager

使用命令行还行，就不用客户端了。贴个[官网链接](https://resp.app/)

## 总结

> Redis的学习告一段落，其中用的最多的应该还是对数据的操作。