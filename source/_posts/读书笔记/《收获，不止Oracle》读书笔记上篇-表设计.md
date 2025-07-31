---
layout: post
title: 《收获，不止Oracle》读书笔记上篇-表设计
date: 2024-08-01 10:36:33
categories:
  - 读书笔记
tags:
  - 《收获，不止Oracle》
  - Oracle
  - 数据库
---

## 第四章 - 祝贺，表设计成就英雄

- **普通堆表**：适合大部分设计场景，有优点也有缺点，需要和其他表设计取长补短。 
    * 优点：语法简单方便、适用大部分场景
    * 缺点：表更新日志开销较大、Delete无法释放空间、表记录太大检索较慢、素引回表读开销很大、即便有序插入，也难以有序读出
- **全局临时表**：适合接口表设计
    * 优点：高效删除、产生日志少、不同SESSION独立，不产生锁
    * 缺点：语法特别、数据无法得到有效的保护
- **分区表**：适合日志表
    * 优点：有效的分区消除、高效的记录清理、高效的记录转移
    * 缺点：语法复杂、分区过多对系统有一定的影响
- **索引组织表**：适合极少更新的配置表
    * 优点：表就是索引，可以避免回表、语法复杂
    * 缺点：更新开销牧大
- **簇表**：适合使用频繁关联查询的多表
    * 优点：可以减少或避免排序
    * 缺点：语法复杂、表更新开销大

每个人都有每个人的特点和优势，要善于发掘和利用，才可以把事情做好。
不同的表也一样，有的适用于这个应用场景，却不适合另外一个场景，要学会选择性地使用技术。
**技术其实并不难，最难的是如何选择。** 这一章主要就是在强调什么场合该选什么技术。没有高级的技术，只有最合适的技术。

### 普通堆表不足之处

#### 表更新日志开销较大

下面的脚本是利用 v$statname 和 v$mystat 两个动态性能视图来跟踪当前SESSION操作产生的日志量.
使用方法很简单：首次先执行该脚本，查看日志大小，随即执行你的更新语句，再执行该脚本返回的日志大小，两者相减，就是你此次更新语句产生的日志大小。

~~~oraclesqlplus
-- 查看产生多少日志
select a.name, b.value
from v$statname a,
     v$mystat b
where a.statistic# = b.statistic#
  and a.name = 'redo size';
~~~

~~~oraclesqlplus
-- 赋权
grant all on v_$statname to TEST_USER;
grant all on v_$mystat to TEST_USER;
-- 以下创建视图，方便后续直接用 select * from v_redo_size 进行查询
create or replace view v_redo_size as
select a.name, b.value
from v$statname a,
     v$mystat b
where a.statistic# = b.statistic#
  and a.name = 'redo size';
~~~

下面观察各个更新操作产生的日志量。

~~~text
SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                               600

SQL> delete from t;

70927 rows deleted.

SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                           1152708

SQL> insert into t select OBJECT_ID from dba_objects;

71191 rows created.

SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                           2262512

SQL> update t set id = rownum;

71191 rows updated.

SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                          13080536
~~~

删除操作产生了 1152708 - 600 = 1146708 字节，大约1.09M 的日志。
插入操作产生了 2262512 - 1152708 = 1109804 字节，大约1.06M 的日志。
更新操作产生了 13080536 - 2262512 = 10818024 字节，大约10.32M 的日志。

无论是删除、插入还是修改，都会产生日志。前面体系结构中讲过这些日志是用于数据库的备份和恢复的。
如果仅从性能角度而不从安全性角度来考虑，更新表写日志就意味着数据库多做了额外的事情而影响了效率，虽说安全第一，不过在某些特定的场合，某些表的记录只是作为中间结果临时运算而根本无须永久保留，这些表无须写日志，那就既高效又安全了！
这就是后续会说的全局临时表。

#### Delete无法释放空间

使用 `delete from t` 删除表，前后查询所产生的逻辑读次数是相同的。只有使用 `truncate table t` 清空表，才能显著减少逻辑读次数。
显然，**delete删除并不能释放空间，虽然delete将很多块的记录删除了，但是空块依然保留，Oracle在查询时依然会去查询这些空块。**
**而truncate是一种释放高水平位的动作，这些空块被回收，空间也就释放了。**

不过truncate显然不能替代delete，因为truncate是一种DDL操作而非DML操作，truncate后面是不能带条件的，truncate table t where...是不允许的。
但是如果表中这些where条件能形成有效的分区，Oracle是支持在分区表中做truncate分区的，命令大致为 `alter table t truncate partition '分区名'`。
如果where条件就是分区条件，那等同于换角度实现了truncate table t where...的功能。
**这就是分区表最实用的功能之一了，高效地清理数据，释放空间。**

此外，当大量delete删除再大量insert插入时，Oracle会去这些delete的空块中首先完成插入（直接路径插入除外），所以频繁delete又频繁insert的应用，是不会出现空块过多的情况的。

#### 表记录太大检索较慢

一张表其实就是一个SEGMENT，一般情况下我们都需要遍历该SEGMENT的所有BLOCK来完成对该表进行更新查询等操作，在这种情况下，表越大，更新查询操作就越慢。
有没有什么好方法能提升检索的速度呢？主要思路就是缩短访问路径来完成同样的更新查询操作，简单地说就是完成同样的需求访问BLOCK的个数越少越好。
Oracle为了尽可能减少访问路径提供了两种主要技术，**一种是索引技术，另一种则是分区技术**。

以 `select * from t where insert_time > xxxx and insert_time < xxxx` 为例，如果id是主键，那么Oracle会直接通过索引找到对应的BLOCK，然后直接读取该BLOCK中的记录。

首先说索引，这是Oracle中最重要也是最实用的技术之一。
在本例中，如果 `insert_time > xxxx and insert_time < xxxx` 返回的记录非常少，或者说T表的总记录相比非常少，则在 insert_time 列建索引能极大提升该语句的效率。
比如建了一个 t_id_index 的索引，在该SQL查询时首先会访问 t_id_index 这个新建出来的索引段，然后通过索引段和表段的映射关系，迅速从表中获取行列的信息并返回结果。具体细节后续索引部分细说。
索引本身也是一把双刃剑，既能给数据库开发应用带来极大的帮助，也会给数据库带来不小的灾难。

减少访问路径的第二种技术就是分区技术，把普通表T表改造为分区表，比如以 insert_time 这个时间列为分区字段，比如从 2020年1月到2023年12月按月建36个分区。
早先的T表就一个T段，现在情况变化了，从1个大段分解成了36个小段，分别存储了2010年1月到2012年12月的信息，此时假如 `insert_time > xxxx and insert_time < xxxx` 这个时间跨度正好是落在2020年11月，那Oracle的检索就只要完成一个小段的遍历即可。
假设这36个小段比较均匀，我们就可以大致理解为访问量只有原来的三十六分之一，大幅度减少了访问路径，从而高效地提升了性能。

#### 索引回表读开销很大

观察下面例子中，`TABLE ACCESS BY INDEX ROWID BATCHED` 的开销。

~~~text
L> drop table t purge;

Table dropped.

SQL> create table t as select * from dba_objects where ROWNUM <= 200;

Table created.

SQL> create index t_object_id_index on t(object_id);

Index created.

SQL> set linesize 1000
SQL> set autotrace traceonly
SQL> select * from t where object_id <= 10;

9 rows selected.


Execution Plan
----------------------------------------------------------
Plan hash value: 632031452

---------------------------------------------------------------------------------------------------------
| Id  | Operation                           | Name              | Rows  | Bytes | Cost (%CPU)| Time     |
---------------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT                    |                   |     9 |   963 |     2   (0)| 00:00:01 |
|   1 |  TABLE ACCESS BY INDEX ROWID BATCHED| T                 |     9 |   963 |     2   (0)| 00:00:01 |
|*  2 |   INDEX RANGE SCAN                  | T_OBJECT_ID_INDEX |     9 |       |     1   (0)| 00:00:01 |
---------------------------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   2 - access("OBJECT_ID"<=10)


Statistics
----------------------------------------------------------
       1316  recursive calls
          0  db block gets
       1620  consistent gets
        135  physical reads
          0  redo size
       4319  bytes sent via SQL*Net to client
        108  bytes received via SQL*Net from client
          2  SQL*Net roundtrips to/from client
         96  sorts (memory)
          0  sorts (disk)
          9  rows processed
~~~

一般来说，根据索引来检索记录，会有一个先从索引中找到记录，再根据索引列上的 ROWID 定位到表中从而返回索引列以外的其他列的动作，这就是`TABLE ACCESS BY INDEX ROWID`。
下面观察如果消除 `TABLE ACCESS BY INDEX ROWID BATCHED` 的开销。

~~~text
SQL> select object_id from t where object_id <= 10;

9 rows selected.


Execution Plan
----------------------------------------------------------
Plan hash value: 3023054428

--------------------------------------------------------------------------------------
| Id  | Operation        | Name              | Rows  | Bytes | Cost (%CPU)| Time     |
--------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT |                   |     9 |    36 |     1   (0)| 00:00:01 |
|*  1 |  INDEX RANGE SCAN| T_OBJECT_ID_INDEX |     9 |    36 |     1   (0)| 00:00:01 |
--------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   1 - access("OBJECT_ID"<=10)


Statistics
----------------------------------------------------------
       1262  recursive calls
          0  db block gets
       1484  consistent gets
        151  physical reads
          0  redo size
        697  bytes sent via SQL*Net to client
        108  bytes received via SQL*Net from client
          2  SQL*Net roundtrips to/from client
         96  sorts (memory)
          0  sorts (disk)
          9  rows processed
~~~

这里没有 `TABLE ACCESS BY INDEX ROWID` 了。
因为语句从 `select * from t where object_id <= 10;` 改写为 `select object_id from t where object_id <= 10;` 了，不用从索引中回到表中获取索引列以外的其他列了。
性能上，逻辑读从1620变为1484，代价从2变为1。（每次执行前都清空了共享池和缓存）
避免回表从而使性能提升这是一个很简单的道理，少做事性能当然提升了。
只是 `select * from t` 和 `select object_id from t`毕竞不等价，有没有什么方法可以实现写法依然是 `select * from t` 但是还是可以不回表呢？
**普通表是做不到的，能实现这种功能的只有索引组织表。**

#### 有序插入却难以有序读出

在对普通表的操作中，我们无法保证在有序插入的前提下就能有序读出。
最简单的一个理由就是，如果把行记录插入块中，然后删除了该行，接下来插入的行会去填补块中的空余部分，这就无法保证有序了。
所以在查询数据时，如果想有序地展现，就必须使用order by，否则根本不能保证顺序展现，而order by操作是开销很大的操作。

~~~text
SQL> select object_id from t;

200 rows selected.


Execution Plan
----------------------------------------------------------
Plan hash value: 1601196873

--------------------------------------------------------------------------
| Id  | Operation         | Name | Rows  | Bytes | Cost (%CPU)| Time     |
--------------------------------------------------------------------------
|   0 | SELECT STATEMENT  |      |   200 |   800 |     3   (0)| 00:00:01 |
|   1 |  TABLE ACCESS FULL| T    |   200 |   800 |     3   (0)| 00:00:01 |
--------------------------------------------------------------------------


Statistics
----------------------------------------------------------
          1  recursive calls
          0  db block gets
         20  consistent gets
          4  physical reads
          0  redo size
       4228  bytes sent via SQL*Net to client
        433  bytes received via SQL*Net from client
         15  SQL*Net roundtrips to/from client
          0  sorts (memory)
          0  sorts (disk)
        200  rows processed

SQL> select object_id from t order by OBJECT_ID desc;

200 rows selected.


Execution Plan
----------------------------------------------------------
Plan hash value: 961378228

---------------------------------------------------------------------------
| Id  | Operation          | Name | Rows  | Bytes | Cost (%CPU)| Time     |
---------------------------------------------------------------------------
|   0 | SELECT STATEMENT   |      |   200 |   800 |     4  (25)| 00:00:01 |
|   1 |  SORT ORDER BY     |      |   200 |   800 |     4  (25)| 00:00:01 |
|   2 |   TABLE ACCESS FULL| T    |   200 |   800 |     3   (0)| 00:00:01 |
---------------------------------------------------------------------------


Statistics
----------------------------------------------------------
         50  recursive calls
          6  db block gets
         46  consistent gets
          1  physical reads
       1008  redo size
       4228  bytes sent via SQL*Net to client
        433  bytes received via SQL*Net from client
         15  SQL*Net roundtrips to/from client
          3  sorts (memory)
          0  sorts (disk)
        200  rows processed
~~~

可以观察到，有排序的操作的统计信息模块有个 3 sorts(memory)，表示发生了排序，执行计划中也有`SORT ORDER BY`的关键字。
不过最重要的是，没排序的操作代价为3，有排序的操作代价为4，性能上是有差异的，在大数量时将会非常明显。
关于order by避免排序的方法有两种思路。第一种思路是在order by的排序列建索引，至于为什么，还是留着后续索引部分细说。第二种方法就是，将普通表改造为有序散列聚簇表，这样可以保证顺序插入，order by展现时无须再有排序动作。

### 奇特的全局临时表

从数据安全性来看，对表记录的操作写日志是不可避免的，否则备份恢复就无从谈起了，只是现实中真的有一部分应用对表的某些操作是不需要恢复的，比如运算过程中临时处理的中间结果集，这时就可以考虑用全局临时表来实现。

#### 全局临时表的类型

全局临时表分为两种类型，一种是**基于会话的全局临时表(commit preserve rows)**，一种是**基于事务的全局临时表(on commit delete rows)**。

~~~oraclesqlplus
-- 创建基于会话的全局临时表
drop table t_tmp_session purge;
create global temporary table T_TMP_session on commit preserve rows as select * from dba_objects where 1 = 2;
select table_name, temporary, duration from user_tables where table_name = 'T_TMP_SESSION';
-- 创建基于事务的全局临时表
drop table t_tmp_transaction purge;
create global temporary table t_tmp_transaction on commit delete rows as select * from dba_objects where 1 = 2;
select table_name, temporary, DURATION from user_tables where table_name = 'T_TMP_TRANSACTION';
~~~

#### 观察各类DML的REDO日志量

~~~text
SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                             43504

SQL> insert into T_TMP_session select * from dba_objects;

71208 rows created.

SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                            605748
-- 基于会话的全局临时表，插入数据时产生了 605748 - 43504 = 562244 ，约0.54MB
SQL> insert into t_tmp_transaction select * from dba_objects;

71208 rows created.

SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                           1167932
-- 基于事务的全局临时表，插入数据时产生了 1167932 - 605748 = 562184 ，约0.54MB
SQL> update T_TMP_session set object_id = rownum;

71208 rows updated.

SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                           6850608
-- 基于会话的全局临时表，更新数据时产生了 6850608 - 1167932 = 5682676 ，约5.42MB
SQL> update t_tmp_transaction set object_id = rownum;

71208 rows updated.

SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                          11516184
-- 基于事务的全局临时表，更新数据时产生了 11516184 - 6850608 = 4665576 ，约4.45MB
SQL> delete from T_TMP_session;

71208 rows deleted.

SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                          23298188
-- 基于会话的全局临时表，删除数据时产生了 23298188 - 11516184 = 11782004 ，约11.24MB
SQL> delete from t_tmp_transaction;

71208 rows deleted.

SQL> select * from v_redo_size;

NAME                                                                  VALUE
---------------------------------------------------------------- ----------
redo size                                                          35080104
-- 基于事务的全局临时表，删除数据时产生了 35080104 - 23298188 = 11781916 ，约11.24MB
~~~

**可以发现全局临时表，无论插入，修改还是删除，都还是要写日志。**
**只是无论插入更新还是删除，操作普通表产生的日志都比全局临时表要多。**
具体比较就省略了，比较语句上基本没有差别。

#### 全局临时表两大特性

全局临时表最重要的特点有两个。
1. **高效删除记录**，基于事务的全局临时表COMMIT或者SESSION连接退出后，临时表记录自动删除；基于会话的全局临时表则是SESSION连接退出后，临时表记录自动删除，都无须手动去操作。
2. **针对不同会话数据独立**，不同的SESSION访问全局临时表，看到的结果不同。

##### 高效删除记录

**基于事务的全局临时表COMMIT后，记录会被删除。**
另外，用C0MMT方式删除全局临时表记录所产生的日志量才很小，比起直接用delete方式操作产生的日志量，几乎可以忽略不计了。
这点日志其实还是是COMMIT动作本身产生的，所以基本可以理解为全局临时表的COMMIT或者退出SESSION的方式不会产生日志。

~~~text
SQL> insert into t_tmp_transaction select * from dba_objects;

71208 rows created.

SQL> select count(1) from t_tmp_transaction;

  COUNT(1)
----------
     71208

SQL> commit;

Commit complete.

SQL> select count(1) from t_tmp_transaction;

  COUNT(1)
----------
         0
~~~

**基于会话的全局临时表SESSION退出后，记录会被删除。**

一般来说，基于SESSION的全局临时表的应用会更多一些，少数比较复杂的应用，涉及一次调用中需要记录清空再插入等复杂动作时，才考虑用基于事务的全局临时表。

##### 不同会话独立

即每个session会话中查询到的全局临时表数据是相互独立的，相互隔离、互不干扰。

~~~oraclesqlplus
-- 查询当前会话信息
select * from v$mystat where ROWNUM = 1;
~~~

### 神通广大的分区表

在如今数据量日益增长的海量数据库时代，分区表技术显得尤为重要，甚至可以说使用得当与否将决定到系统的生死。
关于普通堆表的不足，其中表记录太大检索慢和delete删除有瑕疵这两个缺点正好可以被分区表的分区消除和可以高效清理分区数据这两大特点给弥补了。

什么叫分区消除，最通俗的比喻就是，对某表按月份建了范围分区，从1月到12月共12个分区，你查询当前12月的记录，就不会去访问另外11个区，少做事了，这就是分区消除。
高效分区清理呢，就是如果要删除某分区的数据，如果直接delete，速度很慢，而且高水平位也不会释放，查询的块依然很多，这时可以直接truncate这个分区，速度非常快。

**在这个Google的时代，语法和知识点都不是问题，搜不到的是体系，是重点，是思想。**
上面是书中的原话，这里还想说的就是。时代在进步，如今AI的时代，获取知识更加容易。但无论什么时代，都要善于利用工具。

#### 分区表类型及原理

首先探讨的是分区表的类型及原理。分区表的类型有范围分区、列表分区、HA$H分区及组合分区4种。
其中范围分区应用最为广泛，需要重点学习和掌握，而列表分区次之，在某些场合下也可以考虑使用组合分区，相对而言HASH分区在应用中适用的场景并不广泛，使用的频率比较低。

[oracle分区表的使用和查询](https://www.cnblogs.com/momoyan/p/9164411.html)

##### 范围分区

范围分区最常见的是按时间列进行分区。

~~~oraclesqlplus
-- 创建范围分区表
create table range_part_tab
(
    id        number,
    deal_date date,
    area_code number,
    contents  varchar2(4000)
)
    partition by range (deal_date)
(
    partition p1 values less than (TO_DATE('2024-02-01', 'YYYY-MM-DD')),
    partition p2 values less than (TO_DATE('2024-03-01', 'YYYY-MM-DD')),
    partition p3 values less than (TO_DATE('2024-04-01', 'YYYY-MM-DD')),
    partition p4 values less than (TO_DATE('2024-05-01', 'YYYY-MM-DD')),
    partition p5 values less than (TO_DATE('2024-06-01', 'YYYY-MM-DD')),
    partition p6 values less than (TO_DATE('2024-07-01', 'YYYY-MM-DD')),
    partition p7 values less than (TO_DATE('2024-08-01', 'YYYY-MM-DD')),
    partition p8 values less than (TO_DATE('2024-09-01', 'YYYY-MM-DD')),
    partition p9 values less than (TO_DATE('2024-10-01', 'YYYY-MM-DD')),
    partition p10 values less than (TO_DATE('2024-11-01', 'YYYY-MM-DD')),
    partition p11 values less than (TO_DATE('2024-12-01', 'YYYY-MM-DD')),
    partition p12 values less than (TO_DATE('2025-01-01', 'YYYY-MM-DD')),
    partition p_max values less than (maxvalue)
)

-- 插入一整年随机日期和591-599之间的随机数。共100000条数据
insert into range_part_tab(id, deal_date, area_code, contents)
select rownum,
       to_date(to_char(sysdate - 365, 'J') + TRUNC(DBMS_RANDOM.VALUE(0, 365)), 'J'),
       ceil(dbms_random.value(590, 599)),
       rpad('*', 400, '*')
from dual
connect by rownum <= 100000;
~~~

1. 范围分区的关键字为 `partition by range` ，即这三个关键字表示该分区为范围分区。后面为范围的字段。
2. `values less than` 是范围分区特定的语法，用于指明具体的范围，比如`partition p3 values less than (TO_DATE('2024-04-01', 'YYYY-MM-DD'))`，表示小于3月份的记录。partition p1到partition pmax 表示总共建立了13个分区。最后还要注意`partition p_max values less than (maxvalue)`的部分，表示超出这些范围的记录全部落在这个分区中，包括空值，免得出错。
3. 分区表的分区可分别指定在不同的表空间里，如果不写即为都在同一默认表空间里。如果将每个分区保存到单独的表空间中，这样数据文件就可以跨越多个物理磁盘。

##### 列表分区

列表分区的特点是某列的值只有几个，基于这样的特点我们可以采用列表分区。创建一个按字段数据列表固定可枚举值分区的表。插入记录分区字段的值必须在列表中，否则不能被插入。

~~~oraclesqlplus
-- 创建列表分区表
create table list_part_tab
(
    id        number,
    deal_date date,
    area_code number,
    contents  varchar2(4000)
)
    partition by list (area_code)
(
    partition p_591 values (591),
    partition p_592 values (592),
    partition p_593 values (593),
    partition p_594 values (594),
    partition p_595 values (595),
    partition p_596 values (596),
    partition p_597 values (597),
    partition p_598 values (598),
    partition p_599 values (599),
    partition p_other values (DEFAULT)
)
~~~

1. 列表分区的关键字为`partition by list`，即这三个关键字表示该分区为列表分区。
2. 不同于之前范围分区的`values less than`，列表分区仅需values即可确定范围，值得注意的是，`partition p592 values(592)`并不是说明取值只能写一个，也可写为多个，比如`partition p_union values (592,593,594)`。
3. partition p_591到partition p_other表示总共建立了10个分区。
4. `partition p_other values(default)`，表示不在刚才591到S99范围的记录全部落在这个默认分区中，包括空值，避免应用出错。
5. 分区表的分区可分别指定在不同的表空间里，如果不写即为都在同一默认表空间里。

##### 散列分区（Hash分区）

hash分区最主要的机制是根据hash算法来计算具体某条纪录应该插入到哪个分区中，hash算法中最重要的是hash函数，Oracle中如果你要使用hash分区，只需指定分区的数量即可。
建议分区的数量采用2的n次方，这样可以使得各个分区间数据分布更加均匀。

~~~oraclesqlplus
-- 创建hash分区表
create table hash_part_tab
(
    id        number,
    deal_date date,
    area_code number,
    contents  varchar2(4000)
)
    partition by hash (deal_date)
    PARTITIONS 16;
~~~

1. 散列分区的关键字为`partition by hash`，出现这三个关键字即表示当前分区为散列分区。
2. 散列分区与之前两种分区的明显差别在于：没有指定分区名，而仅仅是指定了分区个数，如`PARTITIONS 16`。
3. 散列分区的分区数量采用2的n次方，这样可以使得各个分区间数据分布更加均匀。
4. 可以指定散列分区的分区表空间，比如增加如下一小段，`STORE IN(ts1,ts2,ts3,ts4,ts5,ts6,ts7,ts8,ts9,ts10,ts11,ts12,ts13,ts14,ts15,ts16)`表示分别存在在12个不同的表空间里，当然不写出表空间就是都在同一默认表空间里。

##### 组合分区

组合分区结合了两种或多种不同的分区方法，如范围分区（Range Partitioning）、列表分区（List Partitioning）和散列分区（Hash Partitioning）。
通过组合使用这些方法，可以实现更高效的查询性能和更好的数据管理。

基于范围分区和列表分区，表首先按某列进行范围分区，然后再按某列进行列表分区，分区之中的分区被称为子分区。
基于范围分区和散列分区，表首先按某列进行范围分区，然后再按某列进行散列分区。
以此类推，其实就是分区中的分区。

~~~oraclesqlplus
-- 创建基于范围和列表的组合分区表
CREATE TABLE range_list_part_tab
(
    id        number,
    deal_date date,
    area_code number,
    contents  varchar2(4000)
)
    partition by range (deal_date) -- 第一级分区：按年份范围分区
    SUBPARTITION by list (area_code) -- 第二级分区：按地区编号列表分区
(
    PARTITION rlp1 VALUES LESS THAN (TO_DATE('2024-06-01', 'YYYY-MM-DD'))
        (
        subpartition rlp1_595 values (595),
        subpartition rlp1_other values (DEFAULT)
        ),
    partition rlp2 values less than (maxvalue)
        (
        subpartition rlp2_595 values (595),
        subpartition rlp2_other values (DEFAULT)
        )
)

-- 简化

CREATE TABLE range_list_part_tab
(
  id        number,
  deal_date date,
  area_code number,
  contents  varchar2(4000)
)
  partition by range (deal_date) -- 第一级分区：按年份范围分区
  SUBPARTITION by list (area_code) -- 第二级分区：按地区编号列表分区
  subpartition template
(
  subpartition p_591 values (591),
  subpartition p_592 values (592),
  subpartition p_593 values (593),
  subpartition p_594 values (594),
  subpartition p_595 values (595),
  subpartition p_596 values (596),
  subpartition p_597 values (597),
  subpartition p_598 values (598),
  subpartition p_599 values (599),
  subpartition p_other values (DEFAULT)
)(
  partition p1 values less than (TO_DATE('2024-02-01', 'YYYY-MM-DD')),
  partition p2 values less than (TO_DATE('2024-03-01', 'YYYY-MM-DD')),
  partition p3 values less than (TO_DATE('2024-04-01', 'YYYY-MM-DD')),
  partition p4 values less than (TO_DATE('2024-05-01', 'YYYY-MM-DD')),
  partition p5 values less than (TO_DATE('2024-06-01', 'YYYY-MM-DD')),
  partition p6 values less than (TO_DATE('2024-07-01', 'YYYY-MM-DD')),
  partition p7 values less than (TO_DATE('2024-08-01', 'YYYY-MM-DD')),
  partition p8 values less than (TO_DATE('2024-09-01', 'YYYY-MM-DD')),
  partition p9 values less than (TO_DATE('2024-10-01', 'YYYY-MM-DD')),
  partition p10 values less than (TO_DATE('2024-11-01', 'YYYY-MM-DD')),
  partition p11 values less than (TO_DATE('2024-12-01', 'YYYY-MM-DD')),
  partition p12 values less than (TO_DATE('2025-01-01', 'YYYY-MM-DD')),
  partition p_max values less than (maxvalue)
);
~~~

1. 组合分区是由主分区和从分区组成的，比如范围列表分区，就表示主分区是范围分区，而从分区是列表分区，从分区的关键字为`subpartition`,比如本例中的`subpartition by list (area_code)`。
2. 为了避免在每个主分区中都写相同的从分区，可以考虑用模版方式，比如简化中的`subpartition TEMPLATE`关键字。
3. 只要涉及子分区模块，都需要有`subpartition`关键字。
4. 关于表空间和之前的没有差别，依然是可以指定，也可以不指定。

##### 分区原理

~~~oraclesqlplus
-- 创建普通表作为对照
create table norm_tab(id number,deal_date date,area_code number,contents varchar2(4000));
insert into norm_tab(id, deal_date, area_code, contents)
select rownum,
       to_date(to_char(sysdate - 365, 'J') + TRUNC(DBMS_RANDOM.VALUE(0, 365)), 'J'),
       ceil(dbms_random.value(590, 599)),
       rpad('*', 400, '*')
from dual
connect by rownum < 100000;
~~~

比较普通表与分区表在段分配上的差异

~~~text
SQL> set linesize 1000
SQL> set pagesize 5000
SQL> column segment_name format a20
SQL> column partition_name format a20
SQL> column segment_type format a20
SQL> select segment_name,partition_name,segment_type,bytes/1024/1024,tablespace_name from user_segments where segment_name IN('RANGE_PART_TAB','NORM_TAB');

SEGMENT_NAME         PARTITION_NAME       SEGMENT_TYPE         BYTES/1024/1024 TABLESPACE_NAME
-------------------- -------------------- -------------------- --------------- ------------------------------
RANGE_PART_TAB       P1                   TABLE PARTITION                   23 SYSTEM
RANGE_PART_TAB       P4                   TABLE PARTITION                    4 SYSTEM
RANGE_PART_TAB       P3                   TABLE PARTITION                    4 SYSTEM
RANGE_PART_TAB       P7                   TABLE PARTITION                    4 SYSTEM
RANGE_PART_TAB       P6                   TABLE PARTITION                    4 SYSTEM
RANGE_PART_TAB       P2                   TABLE PARTITION                    4 SYSTEM
RANGE_PART_TAB       P5                   TABLE PARTITION                    4 SYSTEM
RANGE_PART_TAB       P8                   TABLE PARTITION                .1875 SYSTEM
NORM_TAB                                  TABLE                             46 SYSTEM

9 rows selected.
~~~

分区表会产生多个SEGMENT，而且是建了几个分区就有几个SEGMENT，而普通表仅有一个SEGMENT。
分区表一个很简单的思想：化整为零，将大对象切割成多个小对象，从而使得在指定的小对象中定位到数据成为一种可能，最终达到减少访问路径，尽量少做事就能解决问题的目的。

HASH分区表无法让指定的数据到指定的分区去，这对快速检索数据并不是很有利，因此HASH分区在实际的工作中应用得相对较少一些。
不过任何事情存在即合理，HASH分区会用在什么场合呢？
其实HASH分区最大的好处在于，将数据根据一定HASH算法，均匀分布到不同的分区中去，避免查询数据时集中在某一个地方，从而避免热点块的竞争，改善IO。
此外，HASH可以精确匹配，无法范围扫描。
现实中我们可以针对某些本身就无法有效执行分区范围的列进行HASH分区，比如ID列之类的，在出现热点块竞争严重时，可考虑如此设计。

组合分区的分区数量比起非组合分区会多很多。比如上面创建的`range_list_part_tab`表，有130个分区。
组合分区存在的意义，就是化整为零思想的升级版，将一个大对象切割得更细更小了。这对于一个超级大表来说，也是有一定的意义的。
不过分区表也是有额外开销的，如果分区数量过多，Oracle就需要管理过多的段，在操作分区表时也容易引发Oracle内部大量的递归调用，此外本身的语法也有一定的复杂度。所以一般来说，只有大表才建议建分区，记录数在100万以下的表，基本上不建议建分区。

#### 分区表最实用的特性

##### 高效的分区清除

分区表存在最大的意义就在于，可以有效地做到分区消除，比如你对地区号做了分区，查询福州就只会在福州的分区中查找数据，而不会到厦门、漳州、泉州等其他分区中查找，这就是分区消除，消除了福州以外的所有其他分区。
原理很简单，就是因为分区表其实是将一个大对象分成了多个小对象，通过分区的规则，可以确定数据在哪个或哪几个小对象中，从而减少访问路径。

比较相同语句，普通表无法用到 DEAL_DATE 条件进行分区消除的情况。

~~~text
SQL> select * from range_part_tab where deal_date >= TO_DATE('2024-02-04', 'YYYY-MM-DD') and deal_date < TO_DATE('2024-02-07', 'YYYY-MM-DD');

853 rows selected.

Elapsed: 00:00:00.16

Execution Plan
----------------------------------------------------------
Plan hash value: 16125146

---------------------------------------------------------------------------------------------------------
| Id  | Operation              | Name           | Rows  | Bytes | Cost (%CPU)| Time     | Pstart| Pstop |
---------------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT       |                |   832 |  1655K|   129   (0)| 00:00:01 |       |       |
|   1 |  PARTITION RANGE SINGLE|                |   832 |  1655K|   129   (0)| 00:00:01 |     2 |     2 |
|*  2 |   TABLE ACCESS FULL    | RANGE_PART_TAB |   832 |  1655K|   129   (0)| 00:00:01 |     2 |     2 |
---------------------------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   2 - filter("DEAL_DATE">=TO_DATE(' 2024-02-04 00:00:00', 'syyyy-mm-dd hh24:mi:ss') AND
              "DEAL_DATE"<TO_DATE(' 2024-02-07 00:00:00', 'syyyy-mm-dd hh24:mi:ss'))

Note
-----
   - dynamic statistics used: dynamic sampling (level=2)


Statistics
----------------------------------------------------------
         50  recursive calls
          3  db block gets
        652  consistent gets
          0  physical reads
        620  redo size
      29086  bytes sent via SQL*Net to client
       1508  bytes received via SQL*Net from client
         58  SQL*Net roundtrips to/from client
          2  sorts (memory)
          0  sorts (disk)
        853  rows processed

SQL> select * from norm_tab where deal_date >= TO_DATE('2024-02-04', 'YYYY-MM-DD') and deal_date < TO_DATE('2024-02-07', 'YYYY-MM-DD');

800 rows selected.

Elapsed: 00:00:00.21

Execution Plan
----------------------------------------------------------
Plan hash value: 278673677

------------------------------------------------------------------------------
| Id  | Operation         | Name     | Rows  | Bytes | Cost (%CPU)| Time     |
------------------------------------------------------------------------------
|   0 | SELECT STATEMENT  |          |  1494 |  2971K|  1596   (1)| 00:00:01 |
|*  1 |  TABLE ACCESS FULL| NORM_TAB |  1494 |  2971K|  1596   (1)| 00:00:01 |
------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   1 - filter("DEAL_DATE">=TO_DATE(' 2024-02-04 00:00:00', 'syyyy-mm-dd
              hh24:mi:ss') AND "DEAL_DATE"<TO_DATE(' 2024-02-07 00:00:00',
              'syyyy-mm-dd hh24:mi:ss'))

Note
-----
   - dynamic statistics used: dynamic sampling (level=2)


Statistics
----------------------------------------------------------
         24  recursive calls
         27  db block gets
       6019  consistent gets
          0  physical reads
       4456  redo size
      27437  bytes sent via SQL*Net to client
       1433  bytes received via SQL*Net from client
         55  SQL*Net roundtrips to/from client
          0  sorts (memory)
          0  sorts (disk)
        800  rows processed
~~~

同样的语句，相似记录的表，分区表的代价仅为129，逻辑读只有652，而普通表代价为1596，逻辑读为6019。
差别如此之大，和分区表查询只遍历了13个分区中的一个有关。在分区表查询的执行计划中看到p_start和p_stop都标记上2，表示只遍历了第2个分区。这样避开了对其余12个分区的查询。

下面来看组合分区相同语句的执行计划。

~~~text
SQL> select * from range_list_part_tab where deal_date >= TO_DATE('2024-02-04', 'YYYY-MM-DD') and deal_date < TO_DATE('2024-02-07', 'YYYY-MM-DD');

864 rows selected.

Elapsed: 00:00:00.30

Execution Plan
----------------------------------------------------------
Plan hash value: 3813662781

--------------------------------------------------------------------------------------------------------------
| Id  | Operation              | Name                | Rows  | Bytes | Cost (%CPU)| Time     | Pstart| Pstop |
--------------------------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT       |                     |   692 |  1376K|   135   (2)| 00:00:01 |       |       |
|   1 |  PARTITION RANGE SINGLE|                     |   692 |  1376K|   135   (2)| 00:00:01 |     2 |     2 |
|   2 |   PARTITION LIST ALL   |                     |   692 |  1376K|   135   (2)| 00:00:01 |     1 |    10 |
|*  3 |    TABLE ACCESS FULL   | RANGE_LIST_PART_TAB |   692 |  1376K|   135   (2)| 00:00:01 |    11 |    20 |
--------------------------------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   3 - filter("DEAL_DATE">=TO_DATE(' 2024-02-04 00:00:00', 'syyyy-mm-dd hh24:mi:ss') AND
              "DEAL_DATE"<TO_DATE(' 2024-02-07 00:00:00', 'syyyy-mm-dd hh24:mi:ss'))

Note
-----
   - dynamic statistics used: dynamic sampling (level=2)


Statistics
----------------------------------------------------------
         10  recursive calls
          3  db block gets
        803  consistent gets
          0  physical reads
        620  redo size
      26324  bytes sent via SQL*Net to client
       1533  bytes received via SQL*Net from client
         59  SQL*Net roundtrips to/from client
          0  sorts (memory)
          0  sorts (disk)
        864  rows processed
~~~

组合分区的代价为135，比范围分区稍高。按理说组合分区的粒度更细，代价应该更低才对，为什么呢？
是因为分区数过多，调用有开销。但由于这里表总记录不过10万，全表扫描开销都不是太大，这时Oracle内部调用的开销影响就相对较大。
如果表是一张超级大表，比如有上亿，那这些开销相比而言就可以忽略不计了。
所以分区表应用在大表会更合适。

##### 强大的分区操作

###### 分区 truncate

delete无法释放空间，而truncate却有效地释放了空间。但可惜的是，针对普通表而言，truncate往往不能轻易使用，因为delete往往是针对某些条件的局部记录删除，而truncate显然不能带上条件，无法做到局部删除。
这时分区表就发挥作用了，Oracle可以实现只truncate某个分区，这就等同于实现了局部删除。

`alter table range_part_tab truncate partition p9;` 删除分区表range_part_tab的p9分区

###### 分区数据转移

关于分区表的历史记录的处理，其实是可以分成删除和转移两部分的，关于转移备份的方案，Oracle提供了一个非常棒的工具，就是分区交换，可以实现普通表和分区表的某个分区之间数据的相互交换，他们之间的交换非常快，基本上在瞬间就可以完成。
**实际上只是Oracle在内部数据字典做的一些小改动而已。**

命令：`alter table range_part_tab exchange partition p8 with table mid_table;` 不过要注意的一点是，这两张表的字段必须是完全一样的。
另外，exchange 是交换的含义，两个表的记录会互换，而不是覆盖。

###### 分区切割

`alter table range_part_tab split partition p_max at (TO_DATE('2024-02-01','YYYY-MM-DD')) into (PARTITION p2024_01,PARTITION P_MAX);`

1. 分区切割的三个关键字是split、at/values和into。
2. 如果是RANGE类型的，at部分在此处说明了具体的范围，小于某个指定的值。如果是LIST类型的，使用values。
3. into 部分说明分区被切割成两个分区，比如 `into (PARTITION p2024_01,PARTITION P_MAX);` 表示将 P_MAX 切割成 PARTITION p2024_01 和 PARTITION P_MAX 两部分，其中括号里的 P_MAX 可以改为新的名字，也可以保留原来的名字。
4. **不能对HASH类型的分区进行拆分。**

###### 分区合并

`alter table range_part_tab merge partitions p2024_02,p_max into partition p_max;`

1. 分区合并的关键字是 merge 和 into。
2. merge 后面跟着的是需要合并的两个分区名。
3. into 部分为合并后的分区名，可以是新的分区名，也可以沿用已存在的分区名。
4. 合并分区是将相邻的分区合并成一个分区，结果分区将采用较高分区的界限，值得注意的是，不能将分区合并到界限较低的分区。

###### 分区的增与删

`alter table range_part_tab add partition p2025_01 values less than (TO_DATE('2025-02-01','YYYY-MM-DD'));`

上述语句可以增加分区，不过执行会报错：`ORA-14074: Partition Bound Must Collate Higher Than That Of The Last Partition`
这是因为最后一个分区是`less than(maxvalue)`的情况下，是不能追加分区的，只能SPLIT分裂。
因为追加的分区界限比这个p_max还要低，显然不能允许。不过可以改成先试验分区删除，把这个p_max给删除了，然后追加自然就没问题了。

`alter table range_part_tab drop partition p_max;`

1. 分区增加的关键字是add partition，而分区别除的关键字是drop partition。
2. 由于 max value 分区的存在，无法追加新的分区，必须删除了才可以追加。

#### 分区索引类型

##### 全局索引

全局索引和普通的建索引无异，基本上可以理解为就是普通索引。

`create index idx_part_tab_date on range_part_tab(deal_date);`

##### 局部索引

局部索引其实就是针对各个分区所建的索引。和局部索引相比，全局索引好比一个大索引，而局部索引好比13个小索引。

`create index idx_part_tab_area on range_part_tab(area_code) local;`

#### 分区表相关陷阱

##### 索引频频失效

其中最容易出问题的当属分区表的不当操作导致分区索引失效，这些操作就是前面分区操作，这些动作全部都会导致分区索引中的全局索引失效。
以下是查看range_part_tab表的索引情况，其中STATUS是N/A表示是局部索引，需要进一
步在user_ind partitions中分析其索引的状态，如下：

~~~oraclesqlplus
-- 查看索引情况，其中STATUS是N/A表示是局部索引，需要进一步在user_ind_partitions中分析其索引的状态
select index_name, status
from user_indexes
where index_name in ('IDX_PART_TAB_DATE', 'IDX_PART_TAB_AREA');
-- 查看局部索引状态
select index_name, partition_name, status
from user_ind_partitions
where index_name = 'IDX_PART_TAB AREA';
~~~

> status USABLE 表示索引可用，UNUSABLE 表示索引不可用

其实分区表的分区操作，对局部索引一般都没有影响，但是对全局索引影响比较大。Oracle 在提供这些分区操作时提供了一个很有用的参数 `update global indexes`,可以有效地避免全局索引失效。
其实这个参数的本质动作是在分区操作做完后，暗暗执行了索引重建的工作。使用方式：`alter table range_part_tab truncate partition p2 update global indexes;`

##### 有索引反而效率更低

有时加上索引，分区表的查询效率反而不如普通表。
这个问题涉及索引的特性，**就是索引的高度一般比较低。**
下一章索引里细说，下一章有整整136页。索引真是数据库一大知识点啊

##### 无法应用分区条件

在分区设计时，往往没有预先规划好如何应用分区，这是很不应该的。
操作分区表时，应该用上分区条件，否则无法做到分区消除，这就浪费了分区表的宝贵特性，应该避免出现。
**有无分区条件性能差别很大。**

### 有趣的索引组织表

普通堆表操作时，如果有用到索引，需要先从索引中获取rowid,然后定位到表中，获取id以外的其他列，这就是回表。
如果查询列含索引列以外的列，回表就不可避免。

分别建普通表和索引组织表并插入部分数据，其中的`organization index`关键字就是索引组织表的语法，**索引组织表必须有主键**。

~~~oraclesqlplus
drop table heap_addresses purge;
drop table iot_addresses purge;
create table heap_addresses
(
    empno     number(10),
    addr_type varchar2(10),
    street    varchar2(10),
    city      varchar2(10),
    state     varchar2(2),
    zip       number,
    primary key (empno)
)

create table iot_addresses
(
    empno     number(10),
    addr_type varchar2(10),
    street    varchar2(10),
    city      varchar2(10),
    state     varchar2(2),
    zip       number,
    primary key (empno)
)
    organization index

insert into heap_addresses
select object_id, 'WORK', '123street', 'washington', 'DC', 20123
from all_objects;

insert into iot_addresses
select object_id, 'WORK', '123street', 'washington', 'DC', 20123
from all_objects;
~~~

下面是简单的查询性能比较。

~~~text
SQL> select * from heap_addresses where empno = 22;

Elapsed: 00:00:00.29

Execution Plan
----------------------------------------------------------
Plan hash value: 128237854

----------------------------------------------------------------------------------------------
| Id  | Operation                   | Name           | Rows  | Bytes | Cost (%CPU)| Time     |
----------------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT            |                |     1 |    50 |     1   (0)| 00:00:01 |
|   1 |  TABLE ACCESS BY INDEX ROWID| HEAP_ADDRESSES |     1 |    50 |     1   (0)| 00:00:01 |
|*  2 |   INDEX UNIQUE SCAN         | SYS_C008415    |     1 |       |     1   (0)| 00:00:01 |
----------------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   2 - access("EMPNO"=22)


Statistics
----------------------------------------------------------
          2  recursive calls
          3  db block gets
          7  consistent gets
          0  physical reads
        716  redo size
        935  bytes sent via SQL*Net to client
         83  bytes received via SQL*Net from client
          1  SQL*Net roundtrips to/from client
          0  sorts (memory)
          0  sorts (disk)
          1  rows processed

SQL> select * from iot_addresses where empno = 22;

Elapsed: 00:00:00.33

Execution Plan
----------------------------------------------------------
Plan hash value: 268113143

---------------------------------------------------------------------------------------
| Id  | Operation         | Name              | Rows  | Bytes | Cost (%CPU)| Time     |
---------------------------------------------------------------------------------------
|   0 | SELECT STATEMENT  |                   |     1 |    50 |     1   (0)| 00:00:01 |
|*  1 |  INDEX UNIQUE SCAN| SYS_IOT_TOP_72627 |     1 |    50 |     1   (0)| 00:00:01 |
---------------------------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   1 - access("EMPNO"=22)


Statistics
----------------------------------------------------------
          1  recursive calls
          0  db block gets
          4  consistent gets
          0  physical reads
        140  redo size
       1084  bytes sent via SQL*Net to client
        108  bytes received via SQL*Net from client
          2  SQL*Net roundtrips to/from client
          0  sorts (memory)
          0  sorts (disk)
          1  rows processed
~~~

索引组织表的逻辑读是4而普通表的逻辑读是7，另外普通表读取主键索引后，为了获取索引列以外的列信息，产生了回表`TABLE ACCESS BY INDEX ROWID`，而索引组织表没有。
**索引组织表最大的特点就是，表就是索引，索引就是表，这是一种很特别的设计，所以无须访问表。** 
不过这种设计的表的更新要比普通表开销更大。因为表要和索引一样有序地排列，更新负担将会非常严重。
因此这种设计一般适用在很少更新、频繁读的应用场合，比如配置表，这种表数据一般很少变动，却大量读取。

### 簇表的介绍及应用

普通表还有一点缺陷，就是ORDER BY语句中的排序不可避免。
实际上有序族表可以避免排序。

~~~oraclesqlplus
Drop table cust_orders;
Drop cluster shc;

CREATE CLUSTER shc
(
    cust_id NUMBER,
    order_dt timestamp SORT
)
HASHKEYS 10000
HASH IS cust_id
SIZE 8192

CREATE TABLE cust_orders
(
    cust_id      number,
    order_dt     timestamp SORT,
    order_number number,
    username     varchar2(30),
    ship_addr    number,
    bill_addr    number,
    invoice_num  number
)
    CLUSTER shc (cust_id, order_dt)
~~~

~~~text
SQL> set autotrace traceonly explain
SQL> variable x number
SQL> select cust_id,order_dt,order_number from cust_orders where cust_id =:x order by order_dt;
Elapsed: 00:00:00.31

Execution Plan
----------------------------------------------------------
Plan hash value: 465084913

----------------------------------------------------------------------
| Id  | Operation         | Name        | Rows  | Bytes | Cost (%CPU)|
----------------------------------------------------------------------
|   0 | SELECT STATEMENT  |             |     1 |    39 |     0   (0)|
|*  1 |  TABLE ACCESS HASH| CUST_ORDERS |     1 |    39 |            |
----------------------------------------------------------------------

Predicate Information (identified by operation id):
---------------------------------------------------

   1 - access("CUST_ID"=TO_NUMBER(:X))

Note
-----
   - dynamic statistics used: dynamic sampling (level=2)
~~~

关于避免排序，还有另外一种方法，也是更常见的方法：排序列正好是索引列时，可避免排序。
关于索引避免排序这个知识，也会在下一章与索引相关的部分做详细的介绍。
簇表和索引组织表一样，由于结构的特殊导致更新操作开销非常大，所以也需要谨慎使用。
