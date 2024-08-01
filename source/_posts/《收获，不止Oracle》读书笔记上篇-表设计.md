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



