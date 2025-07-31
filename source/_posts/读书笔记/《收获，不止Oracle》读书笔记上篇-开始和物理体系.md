---
layout: post
title: 《收获，不止Oracle》读书笔记上篇-开始和物理体系
date: 2024-07-11 10:31:50
updated: 2024-07-11 10:31:50
categories:
  - 读书笔记
tags:
  - 《收获，不止Oracle》
  - Oracle
  - 数据库
---

## 前言

由于想深入了解下数据库，包括索引、分区表以及sql优化相关的知识，加上工作使用的是 Oracle 数据库。所以选择这本书开始学习。
最开始看的时候，已经看了四章了。但是不做笔记，总是看了后面忘了前面，所以决定重读并且记笔记。主要及一些重点，方便以后查阅和回忆。
（当然，可能会有很多引用原文的部分，也会有自己的总结。引用的部分就不一一标注了，不过基本也能看出来）

## 第一章 - 意识，少做事从学习开始

这一章的重点就是，**学什么要先了解做什么**。学了没想过怎么用，或者干脆不用，基本上是白学的。
先讲下数据库应用的基本功能，再根据具体的角色（DBA、开发、运维等）看具体该如何使用，根据使用的侧重点不同，而对数据库不同进行深度的学习。
毕竟数据库体系是庞大的，想要全盘掌握不现实，也不必要。按需学习即可。

这里作者是以手机的例子，加以二八现象说明。即百分之二十的功能实现百分之八十的需求，数据库也是一样。
对于开发人员来说，首先应该了解 SQL 的编写，而不是数据库的备份和恢复。而对于运维或者DBA来说，了解数据库的备份和恢复则更为重要。

首先，数据库应用的功能主要分为 数据库开发、数据库管理、数据库优化、数据库设计 四类（当然只是大概）。侧重点如下：

1. 开发：能利用SQL完成数据库的查增删改的基本操作：能用PL/SQL完成及各类逻辑的实现。
2. 管理：能完成数据库的安装、部署、参数调试、备份恢复、数据迁移等系统相关的工作：能完成分配用户、控制权限、表空间划分等管理相关工作：能进行故障定位、问题分析等数据库诊断修复相关工作。
3. 优化：在深入了解数据库的运行原理的基础上，利用各类工具及手段发现并解决数据库存在的性能问题，从而提升数据库运行效率，这个说着轻巧，其实很不容易。
4. 设计：深刻理解业务需求和数据库原理，合理高效地完成数据库模型的建设，设计出各类表及索引等数据库对象，让后续应用开发可以高效稳定。

![各角色需要掌握的知识要点.png](https://cooooing.github.io/images/读书笔记/《收获，不止Oracle》读书笔记上篇-开始和物理体系/各角色需要掌握的知识要点.png)

我的角色目前是开发，后续笔记中也会侧重于开发的内容。除此之外，也会带一些我感兴趣的内容。

## 第二章 - 震惊，体验物理体系之旅

不论什么角色，基础原理都是必学的。首先就是物理体系结构，平时遇到的各种数据库相关问题，很多都可以从中找到解决方法。

![Oracle体系结构图.png](https://cooooing.github.io/images/读书笔记/《收获，不止Oracle》读书笔记上篇-开始和物理体系/Oracle体系结构图.png)

1. **Oracle由实例和数据库组成**，我特意用两个虚框标记出来，上半部的直角方框为实例instance,下半部的圆角方框为数据库Database,大家可以看到我在虚线框左上角做的标注。
2. **实例是由一个开辟的共享内存区SGA(System Global Area)和一系列后台进程组成的**，其中**SGA最主要被划分为共享池(shared pool)、数据缓存区(db cache)和日志缓存(log buffer)三类**。后台进程包括图2-2中所示的PMON、SMON、LCKn、RECO、CKPT、DBWR、LGWR、ARCH等系列进程。
3. 数据库是由数据文件、参数文件、日志文件、控制文件、归档日志文件等系列文件组成的，其中归档日志最终可能会被转移到新的存储介质中，用于备份恢复使用。大家请注意看图2-2中的圆形虚线框标记部分的一个细节，**PGA(Program Global Area)区，这也是一块开辟出来的内存区，和SGA最明显的差别在于，PGA不是共享内存，是私有不共亨的**，S理解为共享的首字母。用户对数据库发起的无论查询还是更新的任何操作，都是在PGA先预处理，然后接下来才进入实例区域，由SGA和系列后台进程共同完成用户发起的请求。
4. PGA起到的其体作用，也就是前面说的预处理，是什么呢？主要有三点：第一，保存用户的连接信息，如会话属性、绑定变量等：第二，保存用户权限等重要信息，当用户进程与数据库建立会话时，系统会将这个用户的相关权限查询出来，然后保存在这个会话区内：第三，当发起的指令需要排序的时候，PGA(Program Global Area)正是这个排序区，如果在内存中可以放下排序的尺寸，就在内存PGA区内完成，如果放不下，超出的部分就在临时表空间中完成排序，也就是在磁盘中完成排序。
5. 我在图中标识了三块区域（大家注意看虚线框的左下角标注），分别是1区圆形虚线框，2区直角方形虚线框，3区圆角方形虚线框。用户的请求发起经历的顺序一般如下：1区→2区→3区：或者1区→2区。

从这个体系结构可以提出一些问题，提问很重要！

1. 为什么会有用户的请求不经过3区数据库的情况，直接从2区实例返回了？
2. 为什么SGA要划分为共享池、数据缓存区、日志缓存区，它们的作用分别是什么？
3. 为什么数据量大时排序会导致sql执行非常缓慢？（这个问题从上面的体系结构中显而易见）

### 从普通查询 sql 开始

从简单的查询sql `select object_name from t where object_id=29;` 开始。
当用户发起这个sql指令后，首先会从1区开始做准备。

PGA区域是仅供当前发起用户使用的私有内存空间，这个区域有三个作用，但这里的连接只完成了**用户连接信息的保存和q权限的保存**。只要该session不断开连接，下次便可以直接从PGA中获取，而不用去硬盘中读取数据。
此外，该sql还会匹配成一条唯一的HASH值，然后进入2区域。首先进入SGA区的共享池。
进入共享池后，先查询是否有地方存储过这个sql（HASH值，唯一标识一个sql）。

如果没有，那首先就要查询这个sql语法是否正确（from是否写成form），语义是否正确（字段、表是否存在），是否有权限。都没问题则会生成唯一HASH并保存。
接下来开始解析，看是否有索引，是索引读高效还是全表扫描高效？oracle要做出抉择。

如何做出抉择？将两种方式都估算一下，看那个代价（COST）更低。这里比较并不会真正分别执行两次来比较，具体方法后文会有。将代价更低的执行计划保存起来，并于HASH对应起来。
有了执行计划之后，便来到数据缓存区来查询数据了。当数据缓存区找不到需要的数据时，便会去3区的数据库中查找，当然得按照执行计划来，这是圣旨，不可违抗。找到后，回到数据缓存区返回，找不到，就找不到了。

1. 这里2区中的日志缓存区并没有说到
2. 3区也只描述了一个数据文件，其他文件并没有被提及
3. 2区中除了SGA，还有很多进程，他们的作用也没有被提及

下面开始实践，可以先跳至文末，搭建Oracle的环境。

~~~oraclesqlplussqlplus
drop table t;
create table t as
select *
from all_objects;
create index idx_object_id on t (object_id);
-- 跟踪SQL的执行计划和执行的统计信息
set autotrace on
-- 设置查询结果在屏幕上显示时每行的最大字符数，使得查询结果不被截断，提高可读性
set linesize 1000
-- 跟踪该语句执行完成的时间
set timing on
select object_name
from t
where object_id = 29;
~~~

第一次查询结果

~~~text
SQL> select object_name from t where object_id = 29;

OBJECT_NAME
--------------------------------------------------------------------------------------------------------------------------------
C_COBJ#

Elapsed: 00:00:00.67

Execution Plan
----------------------------------------------------------
Plan hash value: 1296629646

-----------------------------------------------------------------------------------------------------
| Id  | Operation                           | Name          | Rows  | Bytes | Cost (%CPU)| Time     |
-----------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT                    |               |     1 |    79 |     2   (0)| 00:00:01 |
|   1 |  TABLE ACCESS BY INDEX ROWID BATCHED| T             |     1 |    79 |     2   (0)| 00:00:01 |
|*  2 |   INDEX RANGE SCAN                  | IDX_OBJECT_ID |     1 |       |     1   (0)| 00:00:01 |
-----------------------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   2 - access("OBJECT_ID"=29)

Note
-----
   - dynamic statistics used: dynamic sampling (level=2)


Statistics
----------------------------------------------------------
         11  recursive calls
          0  db block gets
         83  consistent gets
          1  physical reads
          0  redo size
        594  bytes sent via SQL*Net to client
        108  bytes received via SQL*Net from client
          2  SQL*Net roundtrips to/from client
          0  sorts (memory)
          0  sorts (disk)
          1  rows processed
~~~

第二次查询结果：

~~~text
SQL> select object_name from t where object_id = 29;

OBJECT_NAME
--------------------------------------------------------------------------------------------------------------------------------
C_COBJ#

Elapsed: 00:00:00.27

Execution Plan
----------------------------------------------------------
Plan hash value: 1296629646

-----------------------------------------------------------------------------------------------------
| Id  | Operation                           | Name          | Rows  | Bytes | Cost (%CPU)| Time     |
-----------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT                    |               |     1 |    79 |     2   (0)| 00:00:01 |
|   1 |  TABLE ACCESS BY INDEX ROWID BATCHED| T             |     1 |    79 |     2   (0)| 00:00:01 |
|*  2 |   INDEX RANGE SCAN                  | IDX_OBJECT_ID |     1 |       |     1   (0)| 00:00:01 |
-----------------------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   2 - access("OBJECT_ID"=29)

Note
-----
   - dynamic statistics used: dynamic sampling (level=2)


Statistics
----------------------------------------------------------
          0  recursive calls
          0  db block gets
          4  consistent gets
          0  physical reads
          0  redo size
        594  bytes sent via SQL*Net to client
        108  bytes received via SQL*Net from client
          2  SQL*Net roundtrips to/from client
          0  sorts (memory)
          0  sorts (disk)
          1  rows processed
~~~

先简单介绍下统计信息中各个信息的含义：

* Recursive Calls: 表示查询执行期间数据库内部发生的递归调用次数，这可能包括子查询、视图的重写以及其他内部处理所需的多次查询执行。
* DB Block Gets: 指从数据库缓存区中读取数据块的次数，反映的是从内存中获取数据的频率。
* Consistent Gets: 代表为维护数据一致性而从数据库缓存中获取数据块的次数。这在读一致性要求高的查询中尤为重要，确保查询看到的是事务开始那一刻的数据版本。
* Physical Reads: 指从磁盘上实际读取数据块的次数，发生物理读取通常意味着所需数据未在数据库缓存区中找到，需要从持久存储中加载。
* Redo Size: 记录由于本次操作产生的重做日志大小，单位通常是字节。重做日志用于事务恢复。
* Bytes Sent via SQL*Net to Client: 通过SQL*Net网络协议发送到客户端的数据量，包括查询结果集等信息。
* Bytes Received via SQL*Net from Client: 通过SQL*Net网络协议从客户端接收的数据量，主要涉及客户端发送的查询请求等。
* SQL*Net Roundtrips to/from Client: 完成查询操作所需的客户端与服务器之间的网络往返次数，每次往返可能涉及请求或响应。
* Sorts (Memory): 在内存中执行的排序操作次数，用于组织数据以便于高效查询或显示。
* Sorts (Disk):当内存不足，需要使用临时表空间在磁盘上进行排序操作的次数，这通常比内存排序效率低。
* Rows Processed: 查询最终处理的行数，即查询结果集中包含的行数。

第一次执行花费0.67秒，第二次只花费了0.27秒。比第一次快了很多
接下来是统计信息的差别
第一次执行，产生了11次递归调用、83次逻辑读、1次物理读
第二次执行，产生了0次递归调用、4次逻辑读、0次物理读

下面是描述两次执行的差异：

1. 用户首次执行该SQL指令时，该指令从磁盘中获取用户连接信息和相关权限信息权限，并保存在PGA内存里。当用户再次执行该指令时，由于SESSION之前未被断开重连，连接信息和相关权限信息就可以在PGA内存中直接获取，避免了物理读。
2. 首次执行该SQL指令结束后，SGA内存区的共享池里已经保存了该SQL唯一指令HASH值，并保留了语法语意检查及执行计划等相关解析动作的劳动成果，当再次执行该$QL时，由于该SQL指令的HASH值和共享池里保存的相匹配了，所以之前的硬解析动作就无须再做，不仅跳过了相关语法语意检查，对于该选取哪种执行计划也无须考虑，直接拿来主义就好了。
3. 首次执行该SQL指令时，数据一般不在SGA的数据缓存区里（除非被别的SQL读入内存了)，只能从磁盘中获取，不可避免地产生了物理读，但是由于获取后会保存在数据缓存区里，再次执行就直接从数据缓存区里获取了，完全避免了物理读，就像上面的实践一样，首次执行物理读为4，第2次执行的物理读为0，没有物理读，数据全在缓存中，效率当然高得多！

即，不用获取用户和权限相关信息、不用进行语法检查和执行计划等相关解析、不用从磁盘获取直接从缓存获取。

### 体会Oracle的代价

在表有索引的情况下，Oracle可以选择索引读，也可以选择全表扫描，这是两种截然不同的执行计划，不见得一定是索引读胜过全表扫，有时索引读的效率会比全表扫更低
所以Oracle的选择不是看是啥执行计划，而是判断谁的代价更低。
下面来比较下两者的代价

这里会使用 HINT 的写法。HINT是一种强制写法，让数据库的查询优化器遵循某种特定的执行路径或采用特定的算法来处理查询。详细的介绍，放在文末。
使用 `/*+full(t)*/` 的写法，来强制该sql不走索引，走全表扫描。如下：
`select /*+full(t)*/object_name from t where object_id = 29;`

> 多次执行同一个SQL查询，可以解析次数减少、物理读减少甚至递归调用次数

下面是走全表扫描的执行结果：

~~~text
SQL> select /*+full(t)*/object_name from t where object_id = 29;

OBJECT_NAME
--------------------------------------------------------------------------------------------------------------------------------
C_COBJ#

Elapsed: 00:00:00.03

Execution Plan
----------------------------------------------------------
Plan hash value: 1601196873

--------------------------------------------------------------------------
| Id  | Operation         | Name | Rows  | Bytes | Cost (%CPU)| Time     |
--------------------------------------------------------------------------
|   0 | SELECT STATEMENT  |      |     1 |    44 |   410   (0)| 00:00:01 |
|*  1 |  TABLE ACCESS FULL| T    |     1 |    44 |   410   (0)| 00:00:01 |
--------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   1 - filter("OBJECT_ID"=29)


Statistics
----------------------------------------------------------
          0  recursive calls
          0  db block gets
       1514  consistent gets
          0  physical reads
          0  redo size
        594  bytes sent via SQL*Net to client
        108  bytes received via SQL*Net from client
          2  SQL*Net roundtrips to/from client
          0  sorts (memory)
          0  sorts (disk)
          1  rows processed
~~~

比较走全表扫描和oracle自己选择的使用索引的方式的执行计划和统计信息，发现代价（Cost）410远大于2，1514次逻辑读也远大于4次。
显而易见，走索引的方式代价更低。

同时，选择的操作也比较艰难，缓存选择的结果，也能避免做重复的事情，提高效率。

第一个问题这里已经有答案了，那就是有缓存的存在，使得后续相同的查询不需要经过3区数据库，直接从2区的缓存中获取结果并返回。

### 再探体系结构原理

#### 从普通更新语句开始

下面主要是二三问题的解答，即体系结构图中上面没有被提及到的组件、进程的作用是什么？

sql语句除了上面的查询，还有更新语句，包括插入、修改、删除三类。如果是一个只读数据库，那么是不需要这么多组件的。
下面以 `update t set object_id=92 where object_id=29;` 为例。

sql执行过程前面和查询语句是一样的

1. 如果该用户并没有退出原连接去新建立一个连接，PGA区的用户连接信息和权限判断等诸多动作依然不用做，否则需要完成用户连接信息和权限判断等诸多动。
2. 如果该语句是第一次执行，在共享池里依然需要完成语法语意分析及解析，update t set object_id=92 where object_id=29指令中想匹配到object_id=29的记录既可以用索引读，也可以用全表扫描，到底选用哪种执行计划需要根据代价的大小来选择。
3. 接下来进入数据缓存区，首次执行该数据一定不在缓存区里，也是和前面一样，先从磁盘中获取到缓存区中...

到这里，查询语句将查询结果返回给用户，他的工作就结束了。但更新语句还有很多工作。

在更新语句改写了缓存区的数据后，将**启动DBWR进程将新的数据从内存刷入磁盘**。进行持久化存储，否则内存断点后，数据会消失。

**日志缓存区保存了数据库相关操作的日志**，记录了这个动作，然后由**LGWR后台进程将其从日志缓存区这个内存区写进磁盘的日志文件里**。
目的很简单，就是为了便于将来出现异常情况时，可以根据日志文件中记录的动作，再继续执行一遍，从而保护数据的安全。

Oracle写日志是很重要的，LGWR进程会将日志缓存区持久化保存到日志文件。日志文件通常有多个，当第一个写满时，会写入第二个...
当所有的日志文件都写满时，会重新从第一个开始覆写。**所以在日志文件被覆写之前，需要将其备份出去，成为归档文件。由ARCH进程进行归档操作。**

#### 关于提交 Commit

当执行一条更新语句后，当前session再次查询是可以查询到更新后的数据的。
但是其他session无法查询到更新后的，因为没有提交。

提交 Commit 和 回滚 Rollback ，都是更新操作后，用户的确认。前者表示用户确认无误，确实需要更新；后者表示用户反悔了，撤销之前的操作。
其中涉及到的细节会很多，这里只是简单描述。

Commit操作，按照正常的逻辑，应该是执行之后，立刻被DBWR进程将更新后的数据写入磁盘，以便其他session查询到最新的数据和防止数据丢失。
但事实上并非如此，因为频繁的写入操作性能较低，等数据缓存区累积到一定量时成批写入性能会更高。但这样无法兼顾数据安全。
**所以Commit操作之后，并不一定会立刻被DBWR进程将更新后的数据写入磁盘。**
很多事情都很难两全其美，和分布式系统中的CAP理论一样。但这里oracle做到了兼顾，下面来说oracle是如何做到的？

因为oracle有日志缓存区和日志文件，在磁盘中记录了所有的操作，所以即便突然断电导致未提交的数据丢失，也可以通过日志文件重新执行之前的操作，从而恢复丢失的数据。
那么数据缓存区是否越大越好呢？
显然并不是，没有什么是极端的，需要从中取得平衡。数据缓存区越大，DBWR批量写入磁盘的效率越高，但断电恢复需要的时间就越长。反之也是一样

下面介绍CKPT，**什么时候将数据缓存区的数据写入磁盘是由CKPT触发的**。
如果更新操作的一直不提交，数据缓存区的数据会被写入磁盘中吗？
答案是会的，**因为DBWR将数据缓存区数据写入磁盘，不是由Commit决定的，而是由CKPT决定的。**
**但当LGWR出现故障时，DBWR并不会听从CKPT的命令。会先等LGWR将日志缓存区的数据写入日志文件，才会完成数据缓存区写入磁盘的操作。**
**因为凡是有记录，否则会发送数据丢失的问题。**

#### 各主要进程总结

1. **PMON (Process Monitor)**:
   PMON负责监控和清理数据库实例中的失败或不响应的用户进程。当检测到一个用户进程异常终止时，PMON会执行清理工作，包括回滚未提交的事务、释放资源以及从进程表中删除相应的条目。
   如果遇到LGWR进程失败这样严重的问题，PMON可能会做出中止实例的激进操作，以防止数据混乱。
   此外，PMON还负责执行某些数据库的初始化任务，如打开监听器连接。
2. **SMON (System Monitor)**:
   SMON关注的是系统级的操作，而非单个进程。主要负责实例恢复工作，在数据库实例启动时执行实例恢复，包括应用联机重做日志以恢复未提交的事务，并清理实例崩溃后可能遗留的临时段。SMON还负责合并空间碎片、回收不再使用的临时段和回滚段。
3. **LCKn (Lock Process)**:
   LCKn是锁进程，仅用于RAC数据库。其中'n'代表编号，表示可以有多个这样的进程（最多可能有10个）。这些进程管理数据库中的锁，确保并发访问的一致性和数据完整性。它们负责授予和撤销对数据库对象的锁，以及解决锁冲突，确保多个用户或进程能够安全地并发访问数据库资源。
4. **RECO (Recovery Process)**:
   RECO用于处理分布式事务中的失败情况。当一个分布式事务的一部分在远程数据库中失败时，RECO会根据两阶段提交协议的记录，自动尝试完成或回滚未决的分布式事务，确保事务的原子性和一致性。
5. **CKPT (Checkpoint Process)**:
   用于触发DBWR从数据缓存区中写出数据到磁盘。CKPT执行越频繁，DBWR写出越频繁，DBWR写出越频繁越不能显示批量特性，性能就越低，但是数据库异常恢复的时候会越迅速。
6. **DBWR (Database Writer)**:
   DBWR负责将数据库缓存区缓存（Buffer Cache）中的脏数据块（已修改但尚未写入磁盘的数据）写入到数据文件中。这有助于释放缓存区空间，提高缓存命中率，并确保数据的一致性。通常，DBWR会有多个实例运行（DBW0, DBW1等），以并行处理大量I/O操作。
7. **LGWR (Log Writer)**:
   LGWR负责将重做日志缓存区中的内容定期或在特定触发条件下（如事务提交、重做日志缓存区空间不足、检查点事件等）写入到在线重做日志文件中。这保证了数据库的事务可恢复性，即使在系统故障后也能恢复到一致状态。
8. **ARCH (Archiver Process)**:
   在归档日志模式下，ARCH进程负责将已填满并归档标记的在线重做日志文件复制到归档存储位置，确保即使原始在线日志被覆盖，重做信息仍然可用，这对于数据库备份和恢复至关重要。在高负载或高可用性要求的系统中，可能有多个ARCH进程并行工作。

> RAC（Real Application Clusters）是Oracle数据库的一项技术，它允许一个数据库分布在多个服务器上，这些服务器共享相同的数据库实例，并以集群的形式协同工作。RAC架构设计的主要目标是为了提高数据库的可用性、可伸缩性和性能。
> 在RAC环境下，数据库的数据文件、控制文件和重做日志文件等存储在共享存储设备上，所有参与集群的节点都可以访问这些共享资源。每个节点都运行着自己的Oracle实例，包含一个数据库实例进程集合，如LGWR、DBWR、CKPT等，以及前面提到的后台进程。这些实例通过高速互联（如InfiniBand网络）相互通信，协调对数据库的访问和数据修改。
> RAC的实施和运维相对复杂，需要仔细规划网络、存储和系统资源，以及精细的配置和管理，以确保集群的稳定运行和最佳性能。

LGWR的工作就是将日志缓存区的数据写入到磁盘的REDO日志文件中。完成对更新操作的记录，可用于数据库的异常恢复。
因为操作发生是有顺序的，比如建表、插入数据、删除、修改...
如果建表操作没有被记录，那么后续所有的操作都无法被执行。
**LGWR必须顺序的记录这些操作，顺序记录才有意义。因此，LGWR是单线程的。**

LGWR有5条规则，来适应高强度的日志记录工作。

1. 每隔三秒钟，LGWR运行一次。
2. 任何COMMIT触发LGWR运行一次。
3. DBWR要把数据从数据缓存写到磁盘，触发LGWR运行一次。
4. 日志缓存区满三分之一或记录满1MB,触发LGWR运行一次。
5. 联机日志文件切换也将触发LGWR。

#### 关于回滚 Rollback

还是以 `update t set object_id=92 where object_id=29;` 为例。前面说过的PGA和共享池区部分省略

1. 想更新object_id=29的记录首先就需要查到object_id=29的记录，检查object_id=29是否在数据缓存区里，不存在则从磁盘中读取到数据缓存区中，这一点和普通的查询语句类似。
2. 但是这毕竞不是查询语句而是更新语句，于是要做一件和查询语句很不同的事，在回滚表空间的相应回滚段事务表上分配事务槽，从而在回滚表空间分配到空间。该动作需要记录日志写进日志缓存区。
3. 在数据缓存区中创建object_id=29的前镜像，前镜像数据也会写进磁盘的数据文件里（回滚表空间的数据文件)，从缓存区写进磁盘的规律前面已经说过了，由CKPT决定，由LGWR写入，当然也别忘记了这些动作都会记录日志，并将其写进日志缓存区，劳模LGWR还在忙着将日志缓存区的数据写入磁盘形成redo文件呢。
4. 前面步骤做好了，才允许将object_id=29修改为object_id=92,这个显然也是要记录进日志缓存区的。
5. 此时用户如果执行了提交，日志缓存区立即要记录这个提交信息，然后就把回滚段事务标记为非激活INACTIVE状态，表示允许重写。
6. 如果是执行了回滚呢，Oracle需要从回滚段中将前镜像object_id=29的数据读出米，修改数据缓存区，完成回滚。这个过程依然要产生日志，要写数据进日志缓存区。

记录前镜像为什么也需要记录日志？
前镜像会记录在SGA的数据缓存区（Undohu缓存区）里，由CKPT触发LGWR数据缓存区写入磁盘。
**用于准备回滚的前镜像数据的生成其实和普通数据操作差不多，唯一的差别就在于一个是刷新到磁盘的普通文件里，一个是刷新到磁盘的回滚数据文件里。**

普通数据可能会出现事务已经commit，但数据还在数据缓存区中，没有被写入磁盘，数据丢失需要根据redo来进行重做恢复的场景。
回滚前镜像数据也是这样，需要记录回滚前镜像数据的相关操作，来应对用户需要回滚，但回滚前镜像数据既不在内存也不在磁盘的情况（比如突然断电）
此时回滚，则需要依据记录了前镜像数据的redo日志来重做一次还原前镜像数据的操作。

下面来看回滚段的相关参数。

~~~text
SQL> show parameters undo

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
temp_undo_enabled                    boolean     FALSE
undo_management                      string      AUTO
undo_retention                       integer     900
undo_tablespace                      string      UNDOTBS1
~~~

UNDO MANAGEMETN为AUTO表示是自动回滚段管理，回滚段空间不够时可以自动扩展
UNDO RETENTION为900的含义是，DML语句需要记录前镜像，当COMMIT后，表示回滚段保留的前镜像被打上了可以覆盖重新使用的标记，但是要在900秒后方可允许
UNDO TABLESPACE为UNDOTBS1就不用多解释了，表示回滚段表空间的名字为UNDOTBS1

Undo日志（回滚日志）和Redo日志（重做日志）共同确保了事务处理的ACID特性（原子性、一致性、隔离性、持久性），特别是在事务管理和数据库恢复过程中。下面详细解释两者的作用：

* Undo日志（回滚日志）
  **事务回滚：**Undo日志记录了事务对数据库所做的修改前的原始数据状态。当一个事务需要被回滚时（例如，事务执行失败或者用户发出了ROLLBACK命令），数据库系统会利用Undo日志来撤销事务中已经执行的所有修改，恢复数据库到事务开始前的一致状态。这一过程保证了事务的原子性，即事务中的所有操作要么全部成功，要么全部失败。
  **多版本并发控制（MVCC）：**在支持多版本并发控制的数据库（如Oracle的InnoDB存储引擎）中，Undo日志还用来提供历史版本的数据，以便在事务执行期间保持数据的一致视图。这样，即使其他事务已经修改了数据，当前事务仍能看到符合其开始时刻的数据状态，增强了并发控制的能力。
* Redo日志（重做日志）
  **事务恢复：**Redo日志记录了事务对数据库所做的所有修改操作，包括修改后的数据值、修改类型以及数据所在的位置。在系统发生故障（如电源故障、系统崩溃）之后，数据库可以使用Redo日志来“重做”那些已经完成但还未持久化到磁盘的事务操作，确保数据的持久性。即使在崩溃发生前数据尚未完全写入数据文件，也能通过重做日志恢复到崩溃前的最新状态。
  **保证数据不丢失：**Redo日志在事务提交时被写入，并且通常会先于实际数据更改持久化到磁盘，以防止在提交过程中出现故障导致的数据丢失。

DML语句不同于查询语句，会改变数据库的数据。
除此之外，还会产生用于将来恢复的redo和用于回退的undo。
另外还有一个细节就是，由于undo也需要保护，所以还会专门产生保护undo操作的redo。


#### 一致读的原理

查询的结果由查询的那个时刻决定了，后续数据新的变化是不予理睬的。
如果不这样，Oracle每次查询的结果都可能会不一样，会导致错误的产生。
比如从a向b转钱，两者的余额总和无论何时都应该是一样的。但如果在转钱之前查询余额总和，查询的过程中，钱才转到b的账户中，此时查询的最终结果肯定是错误的。
因为oracle不可能回头去查变化后的数据，这样如果一直有变化产生，查询将永远不会结束。

先介绍两个概念：
1. 系统更改号 SCN,SCN的全称是：System Change Number,这是一个只会增加不会减少的递增数字，存在于Oracle的最小单位块里，当某块改变时SCN就会递增。
2. 回滚段记录事务槽（）（前面我在描述回滚的时候提过，事务槽是用来分配回滚空间的)，如果你更新了某块，事务就被写进事务槽里。如果未提交或者回滚，该块就存在活动事务，数据库读到此块可以识别到这种情况的存在。

当开始查询时，首先会获取查询时刻的SCN号。查询过程中会比较查询时刻的SCN号与当前数据块头部的ITL槽内的SCN号（如果有多个ITL槽，取最大的SCN号）
如果查询时刻的SCN号大于ITL槽内的SCN号，说明该块的数据在这段时间没有被更新，可以放心地正常全部读。
如果查询时刻的SCN号小于ITL槽内的SCN号，说明该块的数据在这段时间被更新了，需要根据ITL槽中记录的对应的undo块的地址找到undo块，将undo块中记录的修改前的数据取出。

不过并不是查询开始的SCN大于等于查询中所有块的SCN就一定可以直接获取数据。
因为当前镜像数据c从回滚段中找不回来时，这个查询将会以 ORA-01555: Snapshot too old 的错误终止。查询失败，也不会返回一个错误的查询结果。


> ORA-01555 错误，正式名称为"Snapshot Too Old"（快照过旧），是Oracle数据库中常见的错误之一。
> 这个错误通常发生在执行查询或事务处理期间，数据库无法为查询结果提供足够旧的一致性读取快照，导致查询失败。这意味着数据库无法确保查询结果反映的是查询开始那一刻的数据状态，违反了读一致性原则。
> 
> **触发条件**：
> 1. **Undo表空间大小不足**：如果数据库配置的Undo表空间大小较小，不足以存放长时间运行查询期间产生的undo信息，旧的undo记录可能会被新事务产生的undo信息覆盖。
> 2. **长查询与高并发更新**：在查询执行过程中，如果有大量其他事务并发地对报表查询所涉及的数据表进行更新或删除操作，这将迅速消耗undo空间，可能导致查询所需的undo记录被提前清理。
> 3. **Undo_RETENTION设置不当**：即使Undo表空间足够大，但如果Undo_RETENTION参数设置得过低，数据库也可能过早地回收undo信息，即使undo空间仍有空闲。
> 
> **解决方案**：
> - 增加Undo表空间的大小。
> - 调整Undo_RETENTION参数以延长undo数据的保留时间。
> - 优化长查询，减少查询执行时间。
> - 使用绑定变量，减少硬解析，从而减少undo的生成。
> - 在合适的情况下，考虑使用较大的隔离级别，如SERIALIZABLE，尽管这可能会影响并发性能。


早期的SQL Server的数据库版本，是读产生锁，在读数据时表就被锁住，这样确实是不存在问题了，不过如果读表会让表锁住，那数据库的并发会非常的糟糕。
早期的其他数据库版本也有边读边锁的，比如已经读过的记录就允许被修改，而未读过的数据却是被锁住的，不允许修改，这虽然稍稍有些改进，只锁了表的部分而非全部，但是还是读产生锁，非常糟糕。
而Oracle的回滚段，却解决了读一致性的问题，又避免了锁，大大增强了数据库并发操作的能力。

#### 实践

##### 内存

查看 sga 内存区大小
~~~text
SQL> show parameters sga

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
allow_group_access_to_sga            boolean     FALSE
lock_sga                             boolean     FALSE
pre_page_sga                         boolean     TRUE
sga_max_size                         big integer 1536M
sga_min_size                         big integer 0
sga_target                           big integer 1536M
~~~

查看 pga 内存区大小
~~~text
SQL> show parameters pga

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
pga_aggregate_limit                  big integer 2G
pga_aggregate_target                 big integer 512M
~~~

查看 共享池 大小
~~~text
SQL> show parameters shared_pool_size

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
shared_pool_size                     big integer 0
~~~

查看 数据缓存区 大小
~~~text
SQL> show parameters db_cache_size

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
db_cache_size                        big integer 0
~~~

会发现，共享池和数据缓存区的大小都为0
因为这里Oracle设置为SGA自动管理，共享池和数据缓存区的大小分配由之前的SGA MAX SIZE和SGA TARGET决定，总的大小为1536M
它们分别被分配多少由Oracle来决定，无须我们人工干预，其中SGA TARGET不能大于SGA MAX SIZE。

二者有什么差别呢？举个例子
比如SGA TARGET:=2G,而SGA MAX SIZE=8G,表示数据库正常运行情况下操作系统只分配2G的内存区给Oracle使用，而这2G就是共享池和数据缓存区等内存组件分配的大小
可是运行中发现内存不够用，这时OS可以再分配内存给SGA,但是最大不可以超过8G。

一般情况下都建议使用SGA内存大小自动分配的原则，如果一定要手工分配也行，把SGA TARGET设置为O,再把SHARED POOL SIZE和DB CACHE SIZE设置为非O,就可以了。
在启用自动管理时，数据库管理员不需要手动设置各个SGA组件（如共享池、数据缓冲区、大型池、Java池等）的确切大小。
相反，管理员会设置一个总的SGA目标大小（如通过SGA_TARGET参数），或者在使用AMM时，设置一个总的内存目标大小（MEMORY_TARGET），包括SGA和PGA（Program Global Area，程序全局区）。
Oracle数据库根据当前的工作负载和需求动态调整各个组件的大小，以优化资源使用和性能。

可以使用 ipcs -m 的查看共享内存的命令：

~~~text
bash-4.4$ ipcs -m

------ Shared Memory Segments --------
key        shmid      owner      perms      bytes      nattch     status      
0x00000000 0          oracle     600        5361664    102                     
0x00000000 1          oracle     600        1593835520 51                      
0x00000000 2          oracle     600        4530176    51                      
0xf2c898a4 3          oracle     600        20480      51  
~~~

> `ipcs -m` 是一个在Linux系统中用于显示内存共享段信息的命令。`ipcs` 命令是一个用于报告进程间通信（IPC）设施状态的实用程序，包括消息队列、信号量集和共享内存段。当加上 `-m` 选项时，它专门针对共享内存进行操作，显示当前系统中所有共享内存段的详细信息。
> 共享内存是进程间通信的一种高效方式，允许多个进程直接访问同一块内存区域，从而快速交换数据。`ipcs -m` 输出的信息通常包括如下几列：
> - **Key**：共享内存段的键值，用于标识共享内存段。
> - **shmid**：共享内存段的ID。
> - **Owner**：创建共享内存段的用户ID。
> - **Perms**：共享内存段的权限。
> - **Bytes**：共享内存段的大小（字节数）。
> - **Nattch**：当前连接到该共享内存段的进程数。
> - **Status**：共享内存段的状态，比如是否被附加（attached）。
> - **ctime**：共享内存段创建的时间。
> - **mtime**：共享内存段最后一次修改的时间。


查看 日志缓存区 大小
~~~text
SQL> show parameters log_buffer

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
log_buffer                           big integer 4192K
~~~

一般日志缓冲区满三分之一便会触发LGWR，将缓冲区中的内容写入磁盘，以确保有足够的空间供新的重做记录使用。

那该如何修改这些设置呢？具体命令如下：
使用 `alter system set <parameter_name>=<value> scope=memory|spfile both [sid=<sid_name>]` 命令可以动态修改许多系统参数。
其中 scope 参数表示其作用范围和持久性，它有三个枚举值。
* memory:只改变当前实例运行，重新启动数据库后失效。
* spfile:只改变spfile的设置，不改变当前实例运行，重新启动数据库后生效。
* both（默认值）:同时改变实例及spfile,当前更改立即生效，重新启动数据库后仍然有效。

可以通过 ALTER SYSTEM 或者导入导出来更改 spfile 的内容。
针对RAC环境，ALTER SYSTEM 还可以指定SD参数，对不同实例进行不同的设置。

1. 如果当前实例使用的是pfle而非spfile,则scope=-spfile或scope--both会产生错误
2. 如果实例以pfle启动，则scope的默认值为memory,若以spfile启动，则默认值为both
3. 有些参数（静态参数）必须重启才能生效，如log buffer

##### 进程

Oracle数据库是由实例和一组数据库文件组成的，实例则是由Oracle开辟的内存区和一组后台进程组成的。

下面登录Oracle数据库环境，来看一下这些后台进程。
这里登录的环境是Linux/UNIX环境，因为Windows环境中Oracle是多线程形式的，不好查看。而UNIX环境是多进程形式的，更方便查看。

查看 实例名称
~~~text
SQL> show parameters instance_name

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
instance_name                        string      FREE
~~~

使用实例名称来过滤，比使用oracle更加精准。

~~~text
bash-4.4$ ps -ef|grep FREE  
oracle        33       1  0 Jul16 ?        00:00:33 db_pmon_FREE
oracle        37       1  0 Jul16 ?        00:00:06 db_clmn_FREE
oracle        41       1  0 Jul16 ?        00:00:48 db_psp0_FREE
oracle        45       1  0 Jul16 ?        00:00:52 db_vktm_FREE
oracle        51       1  0 Jul16 ?        00:00:19 db_gen0_FREE
oracle        55       1  0 Jul16 ?        00:00:10 db_mman_FREE
oracle        61       1  0 Jul16 ?        00:00:09 db_gen2_FREE
oracle        63       1  0 Jul16 ?        00:00:10 db_diag_FREE
oracle        65       1  0 Jul16 ?        00:00:08 db_ofsd_FREE
oracle        69       1  0 Jul16 ?        00:00:14 db_gwpd_FREE
oracle        71       1  0 Jul16 ?        00:01:24 db_dbrm_FREE
oracle        73       1  0 Jul16 ?        00:10:04 db_vkrm_FREE
oracle        75       1  0 Jul16 ?        00:00:38 db_pman_FREE
oracle        78       1  0 Jul16 ?        00:01:42 db_dia0_FREE
oracle        81       1  0 Jul16 ?        00:00:28 db_dbw0_FREE
oracle        83       1  0 Jul16 ?        00:00:28 db_lgwr_FREE
oracle        85       1  0 Jul16 ?        00:00:54 db_ckpt_FREE
oracle        87       1  0 Jul16 ?        00:00:05 db_smon_FREE
oracle        90       1  0 Jul16 ?        00:00:19 db_smco_FREE
oracle        96       1  0 Jul16 ?        00:00:03 db_reco_FREE
oracle       102       1  0 Jul16 ?        00:00:11 db_lreg_FREE
oracle       109       1  0 Jul16 ?        00:00:10 db_pxmn_FREE
oracle       115       1  0 Jul16 ?        00:01:06 db_mmon_FREE
oracle       117       1  0 Jul16 ?        00:01:00 db_mmnl_FREE
oracle       121       1  0 Jul16 ?        00:01:55 db_bg00_FREE
oracle       123       1  0 Jul16 ?        00:00:09 db_w000_FREE
oracle       131       1  0 Jul16 ?        00:00:47 db_bg01_FREE
oracle       137       1  0 Jul16 ?        00:00:53 db_bg02_FREE
oracle       146       1  0 Jul16 ?        00:00:03 db_d000_FREE
oracle       148       1  0 Jul16 ?        00:00:02 db_s000_FREE
oracle       150       1  0 Jul16 ?        00:00:03 db_tmon_FREE
oracle       152       1  0 Jul16 ?        00:00:08 db_rcbg_FREE
oracle       159       1  0 Jul16 ?        00:00:03 db_tt00_FREE
oracle       162       1  0 Jul16 ?        00:00:08 db_tt01_FREE
oracle       166       1  0 Jul16 ?        00:00:08 db_p000_FREE
oracle       254       1  0 Jul16 ?        00:00:03 db_aqpc_FREE
oracle       381       1  0 Jul16 ?        00:19:13 db_cjq0_FREE
oracle       423       1  0 Jul16 ?        00:00:04 db_qm02_FREE
oracle       427       1  0 Jul16 ?        00:00:02 db_q002_FREE
oracle       431       1  0 Jul16 ?        00:00:06 db_q004_FREE
oracle       478       1  0 Jul16 ?        00:00:09 db_w001_FREE
oracle      1007    1006  0 Jul16 ?        00:00:00 oracleFREE (DESCRIPTION=(LOCAL=YES)(ADDRESS=(PROTOCOL=beq)))
oracle      4550       1  0 Jul16 ?        00:00:04 oracleFREE (LOCAL=NO)
oracle     44919       1  0 Jul17 ?        00:00:00 oracleFREE (LOCAL=NO)
oracle     45470       1  0 Jul17 ?        00:00:00 oracleFREE (LOCAL=NO)
oracle     65331       1  0 Jul17 ?        00:00:00 oracleFREE (LOCAL=NO)
oracle    120778       1  0 Jul18 ?        00:01:20 db_m005_FREE
oracle    121022       1  0 Jul18 ?        00:01:20 db_m004_FREE
oracle    123426       1  0 Jul18 ?        00:01:17 db_m003_FREE
oracle    125755       1  0 Jul18 ?        00:01:18 db_m000_FREE
oracle    167946       1  0 10:41 ?        00:00:00 oracleFREE (LOCAL=NO)
oracle    171135       1  0 11:58 ?        00:00:12 db_m006_FREE
oracle    178882  170338  0 15:05 pts/6    00:00:00 grep FREE
~~~

这里可以看到有很多前面介绍的进程，比如lgwr。
LOCAL=NO 表示非Oracle本身的进程，是通过其他用户通过监听连接进数据库进行访问的。

这里缺少了一个重要的进程，ARCH归档进程。
当日志循环写入过程中会出现下一个日志已经被写过的情况，再继续写将会覆盖其内容，需要将这些即将被覆盖的内容写出到磁盘里去形成归档文件。
这样日志记录不会丢失，将来数据库就可以从这些日志文件和归档文件中进行数据库的恢复处理。
不过这个归档并非总是必要的。

~~~text
SQL> archive log list 
Database log mode              No Archive Mode
Automatic archival             Disabled
Archive destination            /opt/oracle/product/23ai/dbhomeFree/dbs/arch
Oldest online log sequence     8
Current log sequence           6
~~~

可以看到 No Archive Mode 数据库归档是关闭的。
更改数据库归档模式需要重启数据库，将数据库置于mount状态后，输入`alter database archivelog`(如果是归档改为非归档，这里是`alter database noarchivelog`)
然后再开启数据库`alter database open`,才可以将数据库更改为非归档，具体步骤如下（这里就不一一执行了）：
1. SQL> shutdown immediate;  -- 关闭数据库
2. startup mount; -- 启动数据库实例，并将数据库装载（mount）到实例中，但不打开（open）数据库。
3. alter database archivelog; -- 将数据库从非归档模式转换为归档模式
4. alter database open; -- 打开数据库

##### 启停

参数文件及控制文件和数据库的启动与关闭是息息相关的，数据库的启动可分为三个阶段，分别是nomount、mount和open。
在启动的过程中可以直接输入startup启动，也可以分成startup nomount、startup mount和alter database open三步分别启动。

1. **STARTUP NOMOUNT**：
    - 此阶段初始化Oracle实例，但不装载数据库的任何数据文件或控制文件。主要用于配置参数、分配内存结构等初始化工作。
    - 读取参数文件（PFILE/SPFILE），分配SGA（系统全局区），启动后台进程。

2. **STARTUP MOUNT**：
    - 装载数据库但不打开。此时，控制文件被读取，数据库结构被识别，但数据文件保持关闭状态。
    - 除了NOMOUNT阶段的工作，还会装载控制文件，验证数据文件和联机重做日志文件的存在和一致性。

3. **ALTER DATABASE OPEN**：
    - 打开数据库，使其对用户可用。数据文件被打开，检查点信息被处理，必要时进行恢复操作。
    - 打开数据文件，应用重做日志以确保数据的一致性，启动必要的后台进程，解锁数据库供用户访问。

4. **STARTUP RESTRICT**（可选）：
    - 以受限模式打开数据库，仅允许特定用户（如DBA）连接，常用于维护操作。
    - 类似OPEN，但限制了连接数据库的用户权限。

5. **STARTUP FORCE**（可选）：
    - 强制关闭数据库（如果已打开）并重新启动。适用于数据库不能正常关闭的情况。
    - 相当于执行了`SHUTDOWN ABORT followed by STARTUP`。

总结起来，nomount阶段仅需一个参数文件即可成功，mount阶段要能够正常读取到控制文件才能成功。
而opn阶段需要保证所有的数据文件和日志文件等需要和控制文件里记录的名称和位置一致，能被锁定访问更新的同时还要保证没有损坏，否则数据库的ope阶段就不可能成功。

关闭是启动的逆过程
首先把数据库关闭，然后数据库和实例之间DISMOUNT，最后实例关闭。
这里三个阶段都在一个命令中完成，如下：

1. **SHUTDOWN NORMAL**：
    - 平缓关闭数据库，等待所有用户断开连接后才关闭，确保数据完整性和一致性。
    - 阻止新连接，等待当前所有会话完成，执行检查点，关闭数据库和实例。

2. **SHUTDOWN TRANSACTIONAL**：
    - 类似于NORMAL，但在所有事务结束前不等待长时间运行的查询。
    - 比NORMAL更快关闭，但保证所有事务完成。

3. **SHUTDOWN IMMEDIATE**：
    - 立即关闭，不等待用户会话完成，但允许当前事务完成。
    - 终止所有非系统会话，允许当前事务快速提交或回滚后关闭。

4. **SHUTDOWN ABORT**：
    - 紧急关闭，不执行任何清理工作，可能导致未提交的事务丢失和需要实例恢复。
    - 立即终止所有会话，不执行检查点或事务回滚，可能导致数据库需要恢复。


##### 文件

没有参数文件，实例无法创建，数据库无法NOMOUNT成功
没有控制文件，数据库无法 MOUNT
没有数据文件，数据库无法打开使用（此外没有了数据文件，那数据也没地方保存了，数据库也失去意义了)
没有日志和归档文件，数据库就失去了保护伞，变得很不安全了。

参数文件位置
~~~text
SQL> show parameters spfile

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
spfile                               string      /opt/oracle/product/23ai/dbhom
                                                 eFree/dbs/spfileFREE.ora
~~~

控制文件位置
~~~text
SQL> show parameters control

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
control_file_record_keep_time        integer     7
control_files                        string      /opt/oracle/oradata/FREE/contr
                                                 ol01.ctl, /opt/oracle/oradata/
                                                 FREE/control02.ctl
control_management_pack_access       string      DIAGNOSTIC+TUNING
diagnostics_control                  string      IGNORE
~~~

数据文件位置
~~~text
SQL> select file_name from DBA_DATA_FILES;

FILE_NAME
--------------------------------------------------------------------------------
/opt/oracle/oradata/FREE/users01.dbf
/opt/oracle/oradata/FREE/undotbs01.dbf
/opt/oracle/oradata/FREE/system01.dbf
/opt/oracle/oradata/FREE/sysaux01.dbf
~~~

日志文件位置
~~~text
SQL> select group#,member from v$logfile;

    GROUP# MEMBER
---------- ----------------------------------------------------------------------
         3 /opt/oracle/oradata/FREE/redo03.log
         2 /opt/oracle/oradata/FREE/redo02.log
         1 /opt/oracle/oradata/FREE/redo01.log
~~~

归档文件位置（这里未开启归档模式，所以没有归档文件）
~~~text
SQL> show parameters recovery

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
_instance_recovery_bloom_filter_size integer     1048576
db_recovery_auto_rekey               string      ON
db_recovery_file_dest                string
db_recovery_file_dest_size           big integer 0
recovery_parallelism                 integer     0
remote_recovery_file_dest            string
transaction_recovery                 string      ENABLED
~~~

告警日志文件
~~~text
SQL> show parameters dump

NAME                                 TYPE        VALUE
------------------------------------ ----------- ------------------------------
background_core_dump                 string      partial
background_dump_dest                 string      /opt/oracle/product/23ai/dbhom
                                                 eFree/rdbms/log
core_dump_dest                       string      /opt/oracle/diag/rdbms/free/FR
                                                 EE/cdump
max_dump_file_size                   string      32M
shadow_core_dump                     string      partial
user_dump_dest                       string      /opt/oracle/product/23ai/dbhom
                                                 eFree/rdbms/log
~~~

##### 监听

如果想在远程A机器上通过网络访问本地B机器上的数据库，B机器上的数据库必须开启监听。
远程的A机器只需安装数据库客户端，然后通过读取A机器上数据库客户端配置的TNSNAMES.ORA的配置文件，即可连接并访问B机器的数据库。
下面介绍监听状态的查看，监听的开启，以及监听的关闭。
以下`Isnrctl status`命令是查看监听的状态命令，其中 Listener Parameter File 和 Listener Log File 定位了监听文件listener.ora以及对应的日志。

~~~text
bash-4.4$ lsnrctl status

LSNRCTL for Linux: Version 23.0.0.0.0 - Production on 25-JUL-2024 20:16:51

Copyright (c) 1991, 2024, Oracle.  All rights reserved.

Connecting to (DESCRIPTION=(ADDRESS=(PROTOCOL=IPC)(KEY=EXTPROC_FOR_FREE)))
STATUS of the LISTENER
------------------------
Alias                     LISTENER
Version                   TNSLSNR for Linux: Version 23.0.0.0.0 - Production
Start Date                16-JUL-2024 15:25:32
Uptime                    9 days 4 hr. 51 min. 19 sec
Trace Level               off
Security                  ON: Local OS Authentication
SNMP                      OFF
Default Service           FREE
Listener Parameter File   /opt/oracle/product/23ai/dbhomeFree/network/admin/listener.ora
Listener Log File         /opt/oracle/diag/tnslsnr/oracle/listener/alert/log.xml
Listening Endpoints Summary...
  (DESCRIPTION=(ADDRESS=(PROTOCOL=ipc)(KEY=EXTPROC_FOR_FREE)))
  (DESCRIPTION=(ADDRESS=(PROTOCOL=tcp)(HOST=0.0.0.0)(PORT=1521)))
Services Summary...
Service "16df542da83f091ce0630500580a27e7" has 1 instance(s).
  Instance "FREE", status READY, has 1 handler(s) for this service...
Service "FREE" has 1 instance(s).
  Instance "FREE", status READY, has 1 handler(s) for this service...
Service "FREEXDB" has 1 instance(s).
  Instance "FREE", status READY, has 1 handler(s) for this service...
Service "PLSExtProc" has 1 instance(s).
  Instance "PLSExtProc", status UNKNOWN, has 1 handler(s) for this service...
Service "freepdb1" has 1 instance(s).
  Instance "FREE", status READY, has 1 handler(s) for this service...
The command completed successfully
~~~

关闭监听 `lsnrctl stop`
关闭监听 `lsnrctl start`


### 体会 sql 性能差异

#### 未优化前，单车速度

使用以下存储过程，实现将1到10万插入到t表中。

~~~oraclesqlplus
create or replace procedure proc1
as
begin
    for i in 1..100000
        loop
            execute immediate
                'insert into t values ('||i||')';
            commit;
        end loop;
end;
-- 这里要记得先预先执行一遍，将过程创建起来！
~~~

初始化表结构、清空共享池、开启计时等。每次执行存储过程前重置，以便观察各个存储的性能。后续省略
~~~text
SQL> drop table t purge;

Table dropped.

Elapsed: 00:00:00.45
SQL> create table t(x int);

Table created.

Elapsed: 00:00:00.15
SQL> alter system flush shared_pool;

System altered.

Elapsed: 00:00:01.28
SQL> set timing on
~~~

~~~text
SQL> exec proc1;

PL/SQL procedure successfully completed.

Elapsed: 00:00:53.68
SQL> select count(*) from t;

  COUNT(*)
----------
    100000

Elapsed: 00:00:00.09
~~~

耗时53秒68，每秒两千条不到。

共享池中缓存下来的SQL语句以及HASH出来的唯一值，都可以在v$sql中对应的 SQL_TEXT 和 SQL_ID 字段中查询到
而解析的次数和执行的次数分别可以从 PARSE_CALL 和 EXECUTIONS 字段中获取。
由于这个过程PROC1执行的是 insert into t 的系列插入，于是我们执行如下语句来查询PROC1在数据库共享池中执行的情况，具体如下：

~~~oraclesqlplus
select t.sql_text,t.sql_id,t.PARSE_CALLS,t.EXECUTIONS
from v$sql t
where sql_text like '%insert into t values%';
~~~

![PROC1在共享池中的执行情况.png](https://cooooing.github.io/images/读书笔记/《收获，不止Oracle》读书笔记上篇-开始和物理体系/PROC1在共享池中的执行情况.png)

可以看到共享池中有大量相似的sql，他们的sql_id都不一样，每个语句都被解析了一次、执行了一次。
这些sql都是高度相似的，如果这些语句都能合并成一种写法，不是就可以只解析一次，然后执行十万次，节省了解析的时间。

#### 绑定变量，摩托速度

~~~oraclesqlplus
create or replace procedure proc2
as
begin
    for i in 1..100000
        loop
            execute immediate
                'insert into t values (:x)' using i;
            commit;
        end loop;
end;
~~~

~~~text
SQL> exec proc2;

PL/SQL procedure successfully completed.

Elapsed: 00:00:03.50
~~~

耗时3秒50，每秒八千多条。
看来sql的解析还是很耗时的。

![PROC2在共享池中的执行情况.png](https://cooooing.github.io/images/读书笔记/《收获，不止Oracle》读书笔记上篇-开始和物理体系/PROC2在共享池中的执行情况.png)

#### 静态改写，汽车速度

execute immediate 是一种动态SQL的写法，常用于表名字段名是变量、入参的情况，由于表名都不知道，所以当然不能直接写SQL语句了。
所以要靠动态SQL语句根据传入的表名参数，来拼成一条SQL语句，由 execute immediate 调用执行。
但是这里显然不需要多此一举，因为insert into t values()完全可以满足需求，表名就是t，是确定的。

~~~oraclesqlplus
create or replace procedure proc3
as
begin
    for i in 1..100000
        loop
            insert into t values (i);
            commit;
        end loop;
end;
~~~

~~~text
SQL> exec proc3;

PL/SQL procedure successfully completed.

Elapsed: 00:00:03.19
~~~

耗时3秒19，又快了一些。

一般来说，静态SQL会自动使用绑定变量
![PROC3在共享池中的执行情况.png](https://cooooing.github.io/images/读书笔记/《收获，不止Oracle》读书笔记上篇-开始和物理体系/PROC3在共享池中的执行情况.png)

从执行情况可以看到proc3也实现了绑定变量，而且动态SQL的特点是执行过程中再解析，而静态SQL的特点是编译的过程就解析好了。
这点差别就是速度再度提升的原因。

#### 批量提交，动车速度

commit 放在里面意味着每插入1条，就要提交1次，那放在循环里就要提交10万次，而放在循环外就是全部插入完后提交1次。
commit 触发 LGWR 将 REDO BUFFER 写出到 REDO LOG 中，并且将回滚段的活动事务标记为不活动，同时让回滚段中记录对应前镜像记录的所在位置标记为可以重写。
切记 commit 可不是写数据的动作，写数据将数据从 DATA BUFFER 刷出磁盘是由 CKPT。

~~~text
SQL> exec proc4;

PL/SQL procedure successfully completed.

Elapsed: 00:00:03.02
~~~

#### 集合写法，飞机速度

`insert into t select rownum from dual connect by level<=100000;`

~~~text
SQL> insert into t select rownum from dual connect by level<=100000;

100000 rows created.

Elapsed: 00:00:00.14
~~~

耗时仅0.14秒
因为原先的过程变为了sql，一条条插入的语句变成了一个集合的概念，变成了一整批地写进 DATA BUFFER 区里。
好比你要运砖头到目的地，一种是一块砖头拿到目的地，再返回拿第二块，直到拿完全部。
而另一种是全部放在板车一起推至目的地，只是这里的目的地是 DATA BUFFER 区而已。

#### 直接路径，火箭速度

时间已经很小了，这时可能会有误差，所以将数据量放大到200万。~~没加太大是因为我这小服务器内存不够~~

~~~text
SQL> insert into t select rownum from dual connect by level<=2000000;

2000000 rows created.

Elapsed: 00:00:01.74
~~~

耗时1.74秒。

下面使用 create table 的直接路径方式来新建t表。
`create table t as select rownum x from dual connect by level<=2000000;`

~~~text
SQL>  create table t as select rownum x from dual connect by level<=2000000;

Table created.

Elapsed: 00:00:01.73
~~~

区别不是很大，可能因为数据量的关系。

#### 并行设置，飞船速度

最后，如果遇到性能好的机器，还是可以大幅度提升性能的。
设置日志关闭 nologging 并且设置 parallel 4 表示用到机器的4个CPU。~~这里还是受限于机器了~~

~~~text
SQL> create table t nologging parallel 4 as select rownum x from dual connect by level<=2000000;

Table created.

Elapsed: 00:00:01.74
~~~


## Oracle 环境的搭建

中间有段时间没有连着写，是去搭建Oracle环境了。毕竟公司的测试环境没有dba权限，还是自己搭一个比较好。
这里为了方便，采用官方的docker镜像进行部署。

首先用 `docker pull container-registry.oracle.com/database/free:latest` 拉取镜像。
镜像比较大，需要等一段时间。确保磁盘有足够的空间，我这里拉取的镜像id是 `7510f8869b04`
如果下载过慢，或者内存不足，可以参考下面修改docker的配置文件 `sudo vim /etc/docker/daemon.json`

~~~json
{
  "data-root": "/new_dir/docker",
  "registry-mirrors": [
    "http://hub-mirror.c.163.com"
  ]
}
~~~

data-root 是docker数据存储位置
registry-mirrors 是镜像加速地址，这里使用的是网易的镜像加速地址
保存后重启docker即可，`sudo systemctl start docker`

镜像拉取完成后，就可以构建启动容器了。
`docker run -d --name oracle -h oracle -p 1521:1521 -v /etc/localtime:/etc/localtime:ro container-registry.oracle.com/database/free:latest`

* -d: 这是一个标志，表示以守护态（detached mode）运行容器，即在后台运行，不会把容器的输出直接打印到当前终端。
* --name oracle: 为新创建的容器指定一个名字 oracle，便于后续引用和管理。
* -h oracle: 设置容器的主机名（hostname）为 oracle。这对于某些依赖主机名的应用配置是有帮助的。
* -p 1521:1521: 映射容器的端口 1521 到宿主机的端口 1521。这允许外部通过宿主机的 1521 端口访问容器中的 Oracle 数据库服务。
* -v /etc/localtime:/etc/localtime:ro: 使用卷挂载的方式，将宿主机的 /etc/localtime 文件或目录以只读（read-only）模式挂载到容器的 /etc/localtime。这样做是为了确保容器内的时间与宿主机保持一致，避免时区问题。

使用 `docker logs -f oracle` 查看容器日志，当出现 `DATABASE IS READY TO USE!` 时，即启动成功。
后面就可以愉快地使用Oracle了。

`docker exec -it oracle sqlplus sys@localhost:1521/FREE as sysdba` 进入容器内，并进行登录。


## HINT

在SQL查询中，HINT 是一种向数据库优化器提供提示的方式，用来指导SQL执行计划的选择。
HINT 不是SQL语言的标准组成部分，而是数据库特有的优化手段，它通常以注释的形式出现在SQL语句中，让数据库的查询优化器遵循某种特定的执行路径或采用特定的算法来处理查询。

在Oracle数据库中，HINT的写法通常是在表名或视图名后面紧跟一个特定的提示关键字或短语，这些提示被包围在 /*+ ... */ 注释符号内。例如，如果你想提示优化器使用特定的索引，可以这样写：

```sql
SELECT /*+ INDEX(table_name index_name) */ column1, column2
FROM table_name
WHERE some_condition;
```

在这个例子中，`INDEX(table_name index_name)` 是一个HINT，告诉优化器使用名为 `index_name` 的索引来访问 `table_name`。

还有一些常见的HINT，如：

- `FULL(table_name)` 强制全表扫描。
- `USE_NL(a b)` 强制使用嵌套循环连接(a表和b表)。
- `USE_HASH(a b)` 强制使用哈希连接(a表和b表)。
- `PARALLEL(table_name, degree)` 指定表并行查询的度数。
- `LEADING(table_name[, ...])` 指定连接顺序的起始表。

需要注意的是，使用HINT应当谨慎，**因为它们会绕过数据库自动优化机制，只有在明确知道优化器选择的执行计划不如预期高效时才应考虑使用。**
而且，随着数据库版本的更新或数据分布的变化，曾经有效的HINT可能不再是最优选择，因此定期审查和调整HINT是必要的。

