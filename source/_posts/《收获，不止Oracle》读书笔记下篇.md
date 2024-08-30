---
layout: post
title: 《收获，不止Oracle》读书笔记下篇
date: 2024-08-29 18:09:22
categories:
  - 读书笔记
tags:
  - 《收获，不止Oracle》
  - Oracle
  - 数据库
---

下篇的章节，主要是作者多年优化工作中的经验总结。
主要是关于解决问题的思路，如何定位问题等。技术相关的其实不多。我也觉得**会发现问题比会解决问题的人更厉害**。
这几章经典的优化操作，主要的思想就是以下这些。（我读完的总结，不一定全。）

1. 少做事，在可以满足需求的情况下，尽量不做无意义的事。毕竟再怎么优化也没有不做快。比如，排序是否需要，一定要的情况下是否可以走索引，所以是有序的，可以避免排序。
2. 提问的方式，描述问题要准确、有重点。避免太过简单或者太过复杂。另外，不要问以前问过的问题，勤用搜索引擎和动手实践独立解决问题。
3. 规范，学习、操作、流程、开发、设计等等方面都需要有规范，规范可以提高效率避免出错。

下面是一些命令，用于排查问题等。

### 流程规范 保障问题快速解决

#### 动态整体

主机动态情况检查

~~~shell
# 主机情况检查（数据库出问题，主机是首先要查看的，皮之不存，毛将焉附）
uname -a
# 检查主机CPU等使用情况（重点关注时间最长的，同时也注意观察主机的内存的物理大小和CPU的个数)
top 
# 报告虚拟内存统计信息以及其他与系统活动相关的信息 1 10 表示每秒输出一次统计信息，一共输出10次
vmstat 1 10
# 统计所有包含 "ora" 的进程数。
ps -ef |grep ora |wc -l
# 统计所有既包含 "ora" 又包含 "LOCAL" 的进程数，这通常指本地监听器和数据库实例的进程。
ps -ef |grep ora |grep LOCAL |wc -l
~~~

vmstat 命令输出结果含义：

- `procs`:
    - `r`: 当前运行和可运行（等待运行）的进程数。
    - `b`: 处于不可中断睡眠状态的进程数。
- `memory`:
    - `swpd`: 使用的虚拟内存交换空间大小（KB）。
    - `free`: 空闲物理内存大小（KB）。
    - `buff`: 用作缓冲区的物理内存大小（KB）。
    - `cache`: 用作缓存的物理内存大小（KB）。
- `swap`:
    - `si`: 每秒从磁盘交换到内存的大小（KB/s）。
    - `so`: 每秒从内存交换到磁盘的大小（KB/s）。
- `io`:
    - `bi`: 每秒从块设备读取的数据量（KB/s）。
    - `bo`: 每秒写入块设备的数据量（KB/s）。
- `system`:
    - `in`: 每秒发生的中断次数。
    - `cs`: 每秒上下文切换次数。
- `cpu`:
    - `us`: 用户空间占用的 CPU 百分比。
    - `sy`: 内核空间占用的 CPU 百分比。
    - `id`: 空闲 CPU 百分比。
    - `wa`: 等待 I/O 完成的 CPU 百分比。
    - `st`: 被窃取的时间百分比（仅在虚拟化环境中可见）。

输出示例：

```
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 2  0      0 115444   6688 1897744    0    0   261    30    3    4  2  3 94  1  0
 0  0      0 114500   6688 1897792    0    0     0    32 1949 3657  3  3 94  0  0
 0  0      0 114648   6688 1897792    0    0     0     0 1642 2953  1  2 97  0  0
 0  0      0 114512   6688 1897792    0    0     0     0 2037 3806  3  3 94  0  0
 0  0      0 114512   6700 1897796    0    0    16    84 2148 3758  3  4 93  0  0
 0  0      0 114512   6700 1897808    0    0     0     0 2152 4052  3  4 94  0  0
 0  0      0 114512   6700 1897808    0    0     0     0 1784 3357  1  2 98  0  0
 0  0      0 115272   6724 1897812    0    0     0   160 2202 4116  3  4 93  0  0
 0  0      0 116028   6756 1897812    0    0     0   324 1835 3365  2  2 95  1  0
 0  0      0 116916   6756 1897812    0    0     0     0 2011 3854  2  4 95  0  0
```

---

性能视图备份

~~~oraclesqlplus
-- 考虑备份数据库性能视图（最好是在新建的非生产使用的单独用户下操作，比如 TEST_USER 用户）
-- 此外在数据库需要重启时，更应考虑备份这些视图
create table diag_session_&yyyymmdd_seq_area nologging as
select *
from gv$session;
create table diag_session_wait_&yyyymmdd_seq_area nologging as
select *
from gv$session_wait;
create table diag_process_&yyyymmdd_seq_area nologging as
select *
from gv$process;
create table diag_sql_&yyyymmdd_seq_area nologging as
select *
from gv$sql;
create table diag_sqlarea_&yyyymmdd_seq_area nologging as
select *
from gv$sqlarea;
create table diag_sql_plan_&yyyymmdd_seq_area nologging as
select *
from gv$sql_plan; --耗性能
create table diag_lock_&yyyymmdd_seq_area nologging as
select *
from gv$lock;
create table diag_locked_object_&yyyymmdd_seq_area nologging as
select *
from gv$locked_object;
create table diag_access_&yyyymmdd_seq_area nologging as
select *
from gv$access;
create table diag_latch_&yyyymmdd_seq_area nologging as
select *
from gv$latch;
create table diag_latch_children_&yyyymmdd_seq_area nologging as
select *
from gv$latch_children;
create table diag_Librarycache_&yyyymmdd_seq_area nologging as
select *
from gv_$Librarycache;
create table diag_rowcache_&yyyymmdd_seq_area nologging as
select *
from gv_$rowcache;
create table diag_sort_segment_&yyyymmdd_seq_area nologging as
select *
from gv$sort_segment;
create table diag_sort_usage_&yyyymmdd_seq_area nologging as
select *
from gv$sort_usage;
create table diag_log_history_&yyyymmdd_seq_area nologging as
select *
from gv$log_history;
create table diag_log_&yyyymmdd_seq_area nologging as
select *
from gv$log;
create table diag_logfile_&yyyymmdd_seq_area nologging as
select *
from gv$logfile;
create table diag_transaction_&yyyymmdd_seq_area nologging as
select *
from gv$transaction;
create table diag_parameter_&yyyymmdd_seq_area nologging as
select *
from gv$parameter;
create table diag_session_longops_&yyyymmdd_seq_area nologging as
select *
from gv$session_longops;
create table diag_bh_&yyyymmdd_seq_area nologging as
select *
from gv$bh;
create table diag_filestat_&yyyymmdd_seq_area nologging as
select *
from gv$filestat;
create table diag_segstat_&yyyymmdd_seq_area nologging as
select *
from gv$segstat;
create table diag_tempstat_&yyyymmdd_seq_area nologging as
select *
from gv$tempstat;
create table diag_datafile_&yyyymmdd_seq_area nologging as
select *
from gv$datafile;
create table diag_tempfile_&yyyymmdd_seq_area nologging as
select *
from gv$tempfile;
create table diag_open_cursors_&yyyymmdd_seq_area nologging as
select *
from gv$open_cursors;
~~~

---

获取基线
当系统觉得有问题时，可以考虑立即取一个断点基线，作为AWR报表的一个断点。
`exec dbms_workload_repository.create_snapshot();`

---

观察临时表空间和回滚段表空间情况

~~~oraclesqlplus
-- 查谁占用了undo表空间
select r.name                      回滚段名
     , rssize / 1024 / 1024 / 1024 "rssize(g)"
     , s.sid
     , s.serial#
     , s.username                  用户名
     , s.status
     , s.sql_hash_value
     , s.sql_address
     , s.machine
     , s.module
     , substr(s.program, 1, 78)    操作程序
     , r.usn
     , hwmsize / 1024 / 1024 / 1024
     , shrinks
     , xacts
from sys.v_$session S
   , sys.v_$transaction t
   , sys.v_$rollname r
   , v$rollstat rs
where t.addr = s.taddr
  and t.xidusn = r.usn
  and r.usn = rs.usn
order by rssize desc;

-- 查谁占用了temp表空间
select t.blocks * 16 / 1024 / 1024
     , s.username
     , s.schemaname
     , t.tablespace
     , t.segtype
     , t.extents
     , s.program
     , s.osuser
     , s.terminal
     , s.sid
     , s.serial#
from v$sort_usage t
   , v$session s
where t.session_addr = s.saddr;

-- 还可查到具体SQL
select sql.sql_id
     , t.blocks * 16 / 1024 / 1024
     , s.username
     , s.schemaname
     , t.tablespace
     , t.segtype
     , t.extents
     , s.program
     , s.osuser
     , s.terminal
     , s.sid
     , s.serial#
     , sql.sql_text
from v$sort_usage t
   , v$session s
   , v$sql sql
where t.session_addr = s.saddr
  and t.sqladdr = sql.address
  and t.sqlhash = sql.hash_value;
~~~

#### 动态局部

通过主机进程PID查SQL
通过主机进程PID查SQL(这个步骤和之前的top命令紧密相连，就是为了直接分析这些耗CPU的进程和哪些SQL有关系)
本来可以用如下方法来查，但是系统出现问题时，一般不容易查出来，太慢（有时用 ordered 或者 no_merge 的 HINT 有效，有时无效)

~~~oraclesqlplus
select /*+ ordered */
    sql_text
from v$sqltext a
where (a.hash_value, a.address) in
      (select decode(sql_hash_value, 0, prev_hash_value, sql_hash_value)
            , decode(sql_hash_value, 0, prev_sql_addr, sql_address)
       from v$session b
       where b.paddr =
             (select addr from v$process c where c.spid = '&pid'))
order by piece asc;
~~~

一般采用下面三步（可避免性能问题，返回结果会快）

~~~oraclesqlplus
-- 1. 获取 addr
select spid
     , addr
     , t.pga_used_mem
     , t.pga_alloc_mem
     , t.pga_freeable_mem
     , t.pga_max_mem
from v$process t
where spid = '$pid';

-- 2. 根据 addr 获取 sql_id
select t.sid
     , t.program
     , t.machine
     , t.logon_time
     , t.wait_class
     , t.wait_time
     , t.seconds_in_wait
     , t.event
     , t.sql_id
     , t.prev_sql_id
from v$session t
where paddr = '$addr';

-- 3. 根据 sql_id 查询具体 SQL
select t.sql_id
     , t.sql_text
     , t.executions
     , t.first_load_time
     , t.last_load_time
     , t.buffer_gets
     , t.rows_processed
from v$sql t
where sql_id in ('$sql_id');
~~~

---

观察当前数据库的版本及等待情况，SQL基本情况。

~~~oraclesqlplus
-- 等待事件（当前)
select t.event, count(*)
from v$session t
group by event
order by count(*) desc;

-- 等待事件（历史汇集）
select t.event, t.total_waits
from v$system_event t
order by total_waits desc;

-- 游标使用情况
select inst_id, sid, count(*)
from gv$open_cursor
group by inst_id, sid
having count(*) >= 1000
order by count(*) desc;

-- PGA占用最多的进程
select p.spid
     , p.pid
     , s.sid
     , s.serial#
     , s.status
     , p.pga_alloc_mem
     , s.username
     , s.osuser
     , s.program
from v$process p
   , v$session s
where s.paddr(+) = p.addr
order by p.pga_alloc_mem desc;

-- 登录时间最长的SESSION(同时获取到 spid ,方便在主机层面 ps-ef|grep spid 来查看)
select *
from (select t.sid
           , t2.spid
           , t.PROGRAM
           , t.status
           , t.sql_id
           , t.PREV_SQL_ID
           , t.event
           , t.LOGON_TIME
           , trunc(sysdate - logon_time)
      from v$session t
         , v$process t2
      where t.paddr = t2.ADDR
        and t.type <> 'BACKGROUND'
      order by logon_time)
where rownum < 20;

-- 物理读和逻辑较多的5QL
-- 逻辑读最多
select *
from (select sql_id
           , sql_text
           , s.executions
           , s.last_load_time
           , s.first_load_time
           , s.disk_reads
           , s.buffer_gets
      from v$sql s
      where s.buffer_gets > 300
      order by buffer_gets desc)
where rownum <= 20;

-- 物理读最多
select *
from (select sql_id
           , sql_text
           , s.executions
           , s.last_load_time
           , s.first_load_time
           , s.disk_reads
           , s.buffer_gets
           , s.parse_calls
      from v$sql s
      where s.disk_reads > 300
      order by disk_reads desc)
where rownum <= 20;

-- 执行次数最多
select *
from (select sql_id
           , sql_text
           , s.executions
           , s.last_load_time
           , s.first_load_time
           , s.disk_reads
           , s.buffer_gets
           , s.parse_calls
      from v$sql s
      order by s.executions desc)
where rownum <= 20;

-- 解析次数最多
select *
from (select sql_id
           , sql_text
           , s.executions
           , s.last_load_time
           , s.first_load_time
           , s.disk_reads
           , s.buffer_gets
           , s.parse_calls
      from v$sql s
      order by s.parse_calls desc)
where rownum < 20;

-- 求 DISK SORT 严重的 SQL
select sess.username, sql.sql_text, sql.address, sort1.blocks
from v$session sess
   , v$sqlarea sql
   , v$sort_usage sort1
where sess.serial# = sort1.session_num
  and sort1.sqladdr = sql.address
  and sort1.sqlhash = sql.hash_value
  and sort1.blocks > 200
order by sort1.blocks desc;
~~~

补充：
在 Oracle SQL 中，`(+)` 符号用于指示外连接（outer join）。除了 `(+)` 符号之外，Oracle 还支持使用 `LEFT OUTER JOIN`,
`RIGHT OUTER JOIN`, 和 `FULL OUTER JOIN` 语法来表达外连接。

JOIN 的写法这里就省略了。下面说 `(+)` 的写法：

- `(+)` 符号用于指示外连接，它可以出现在等式的一边或两边。
- 如果 `(+)` 出现在等式的左边，则表示 LEFT OUTER JOIN。
- 如果 `(+)` 出现在等式的右边，则表示 RIGHT OUTER JOIN。
- 如果 `(+)` 出现在等式的两边，则表示 FULL OUTER JOIN。

语法:

```sql
FROM left_table, right_table
WHERE left_table.column (+) = right_table.column
```

- **语法差异**:
    - 使用 `LEFT OUTER JOIN`, `RIGHT OUTER JOIN`, 和 `FULL OUTER JOIN` 语法时，可以使用现代的 ANSI SQL 标准语法。
    - 使用 `(+)` 符号时，需要使用旧式的逗号连接语法，并在 `WHERE` 子句中指定外连接条件。

- **性能**:
    - 在大多数情况下，使用现代的外连接语法 (`LEFT OUTER JOIN`, `RIGHT OUTER JOIN`, 和 `FULL OUTER JOIN`) 可能会产生更好的执行计划和性能。
    - `(+)` 符号虽然仍然支持，但在新版本的 Oracle 数据库中可能不再推荐使用。

- **版本兼容性**:
    - 确保使用的外连接语法在当前 Oracle 数据库版本中可用。

---

检查是否有过分提交的语句
检查是否有过分提交的语句，关键是得到 sid,代入 V$SESSION 就可知道是什么进程，接下来还可以知道 V$SQL

~~~oraclesqlplus
-- 提交次数最多的SESSION
select t1.sid, t1.value, t2.name
from v$sesstat t1
   , v$statname t2
--where t2.name like '%commit%'
where t2.name like '%user commits?%' -- 可以只选user commits,其他系统级的先不关心
  and t1.STATISTIC# = t2.STATISTIC#
  and value >= 10000
order by value desc;
-- 取得SID既可以代入到v$SESSION和v$SQL中去分析
-- 得出SQL_ID
select t.sid
     , t.program
     , t.machine
     , t.logon_time
     , t.wait_class
     , t.wait_time
     , t.seconds_in_wait
     , t.event
     , t.sql_id
     , t.prev_sql_id
from v$session t
where sid in ('$sid');
-- 根据sql id或prev_sql_id代入得到SQL
select t.sql_id
     , t.sql_text
     , t.executions
     , t.first_load_time
     , t.last_load_time
     , t.buffer_gets
     , t.rows_processed
from v$sql t
where sql_id in ('$sql_id')
~~~

---

检查系统使用绑定变量的情况

~~~oraclesqlplus
-- 查询共享内存占有率
select count(*), round(sum(sharable_mem) / 1024 / 1024, 2)
from v$db_object_cache a;

-- 捕获出需要使用绑定变量的SQL(这里只能适配大多数语句)
Drop table t1 purge;
create table t1 as
select sql_text, module
from v$sqlarea;
alter table t1
    add sql_text_wo_constants varchar2(1000);

CREATE OR REPLACE FUNCTION remove_constants(p_query IN VARCHAR2) RETURN VARCHAR2
AS
    l_query     LONG;
    l_char      VARCHAR2(10);
    l_in_quotes BOOLEAN DEFAULT FALSE;
BEGIN
    FOR i IN 1..LENGTH(p_query)
        LOOP
            l_char := SUBSTR(p_query, i, 1);
            IF (l_char = '''') THEN
                IF l_in_quotes THEN
                    l_in_quotes := FALSE;
                ELSE
                    l_in_quotes := TRUE;
                    l_query := l_query || '''#';
                END IF;
            ELSIF NOT l_in_quotes THEN
                l_query := l_query || l_char;
            END IF;
        END LOOP;

    -- 替换数字
    l_query := TRANSLATE(l_query, '0123456789', '@@@@@@@@@@');

    -- 移除多余的 @ 符号
    FOR i IN 0..8
        LOOP
            l_query := REPLACE(l_query, LPAD('@', 10 - i, '@'), '@');
            l_query := REPLACE(l_query, LPAD('', 10 - i, ''), '');
        END LOOP;

    RETURN UPPER(l_query);
END;
-- 编译函数
    ALTER FUNCTION TEST_USER.remove_constants COMPILE;
update TEST_USER.t1
set sql_text_wo_constants = remove_constants(sql_text);
commit;

-- 执行完上述动作后，以下SQL语句可以完成未绑定变量语句的统计
select sql_text_wo_constants, module, count(*)
from t1
group by sql_text_wo_constants, module
having count(*) > 100
order by 3 desc;
~~~

#### 静态整体

主机静态情况检查

~~~shell
# 查看磁盘空间使用情况
df -h
# 主机内存情况
cat /proc/meminfo
# 主机CPU情况
cat /proc/cpuinfo
~~~

---

记录下Oracle数据库的所有参数设置情况，并检查是否归档

~~~oraclesqlplus
-- 版本及所有参数情况
-- 开启CRT的日志跟踪
-- 版本
select *
from v$version;
-- 所有参数
show parameter
-- 关闭CRT的日志跟踪，将文件取回
-- 其中重点关注的是
-- sga pga log_buffer processes open_cursors session_cached_cursors db_recovery_file_dest cluster_database
-- SGA, PGA, 日志缓冲区, 进程数, 打开的游标数, 会话缓存的游标数, 数据库恢复文件目的地, 集群数据库设置相关的参数。
-- 是否归档
archive log list
~~~

---

检查数据库表和索引是否存在并行度设在其中的情况

~~~oraclesqlplus
-- 检查数据库表和索引是否存在并行度设在其中的情况（很多时候有人用parallel建了表或索引，忘记alter table xxx noparallel关闭了)。
select t.owner, t.table_name, degree
from dba_tables t
where t.degree > '1';
select t.owner, t.table_name, index_name, degree, status
from dba_indexes t
where owner in ('TEST_USER')
  and t.degree > '1';
-- 有问题就要处理，比如索引有并行，就处理如下：
select 'alter index ' || t.owner || '.' || index_name || 'noparallel;'
from dba_indexes t
where owner in ('TEST_USER')
  and t.degree > '1';
~~~

---

检查是否有失效的索引

~~~oraclesqlplus
-- 普通索引
select t.index_name
     , t.table_name
     , blevel
     , t.num_rows
     , t.leaf_blocks
     , t.distinct_keys
from dba_indexes t
where status = 'INVALID';
-- 分区索引
select t2.owner
     , t1.blevel
     , t1.leaf_blocks
     , t1.index_name
     , t2.table_name
     , t1.partition_name
     , t1.status
from dba_ind_partitions t1
   , dba_indexes t2
where t1.index_name = t2.index_name
  and t1.status = 'UNUSABLE'
  and t2.owner in ('TEST_USER');
-- 以下是所有失效对象的检查
select 'alter' ||
       decode(object_type, 'PACKAGE BODY', 'PACKAGE', 'TYPE BODY', 'TYPE', object_type) || '' ||
       owner || '.' || object_name || '' ||
       decode(object_type, 'PACKAGE BODY', 'compile body', 'compile') || ';'
     , t.*
from dba_objects t
where status = 'INVALID'
--owner not in ('PUBLIC','SYSTEM','SYS')
  and owner in ('TEST_USER');
~~~

---

检查是否有显著未释放高水平位的表

~~~oraclesqlplus
select table_name, blocks, num_rows
from user_tables
where blocks / num_rows >= 0.2
  and num_rows is not null
  and num_rows <> 0
  and blocks >= 10000;
-- 这个就可以预测到哪些是高水平位没释放的表。
-- 其中blocks>:=10000是因为低于10000的块说明表的体积太小了，释放或不释放无所谓。

-- 而 blocks / num_rows >= 1 表示是严重有问题的。
-- 而这个 blocks / num_rows >= 0.2 表示至少一个块要装5行数据，如果装不了，那就很奇怪了，值得怀疑了，除非有LONG和CLOB字段或者一堆的VARCHAR2(4OOO)字段。

-- 附（可以释放高水平位的脚本，在 Oracle 的 shrink 方法无效时可采纳）：
create or replace package pkg_shrink
    Authid Current_User
as
    /*
    功能：将delete后的表降低高水平
    */
    procedure p_move_tab(p_tab varchar2);
    procedure p_cal_bytes(p_status varchar2, p_tab varchar2);
    procedure p_rebuid_idx(p_tab varchar2);
    procedure p_main(p_table_name varchar2);
end pkg_shrink;
create or replace package body pkg_shrink
as
    v_sql varchar2(4000);
    procedure p_cal_bytes(p_status varchar2, p_tab varchar2)
    as
        v_tab_bytes number;
        v_idx_bytes number;
        v_str_tab   varchar2(4000);
        v_str_idx   varchar2(4000);
    begin
        select sum(bytes) / 1024 / 1024 into v_tab_bytes from user_segments where segment_name = upper(p_tab);
        select sum(bytes) / 1024 / 1024
        into v_idx_bytes
        from user_segments
        where segment_name IN (SELECT INDEX_NAME
                               FROM USER_INDEXES
                               WHERE TABLE_NAME = upper(p_tab));
        v_str_tab := p_status || '表' || p_tab || '的大小为' || v_tab_bytes || 'M';
        if v_idx_bytes is null then
            v_str_idx := p_status || '无索引';
        else
            v_str_idx := p_status || '索引的大小为' || v_idx_bytes || 'M';
        end if;
        dbms_output.put_line(v_str_tab || ';' || v_str_idx);
    end p_cal_bytes;

    procedure p_move_tab(p_tab varchar2)
    as
        V_IF_PART_TAB NUMBER;
    begin
        SELECT COUNT(*) INTO V_IF_PART_TAB FROM user_part_tables WHERE TABLE_NAME = upper(P_TAB);
        IF V_IF_PART_TAB = 0 THEN --非分区表
            v_sql := 'alter table ' || p_tab || ' move'; -- 完成表的MOVE动作，从而做到降低高水平位，不过也带来了索引的失效！
            DBMS_OUTPUT.put_line(v_sql);
            execute immediate v_sql;
        ELSE -- 分区表
            for i in (SELECT * from USER_TAB_PARTITIONS WHERE TABLE_NAME = upper(p_tab))
                loop
                    v_sql := 'alter table ' || p_tab || ' move partition ' || i.partition_name; -- 完成分区表的MOVE动作，同样带来了索引失效！
                    DBMS_OUTPUT.put_line(v_sql);
                    execute immediate v_Sql;
                end loop;
        END IF;
    end p_move_tab;

    procedure p_rebuid_idx(p_tab varchar2)
    as
        V_NORMAL_IDX NUMBER;
        V_PART_IDX   NUMBER;
    begin
        SELECT COUNT(*)
        INTO V_NORMAL_IDX
        FROM user_indexes
        where table_name = 'PART_TAB'
          AND INDEX_NAME
            NOT IN (SELECT INDEX_NAME FROM user_part_indexes);
        IF V_NORMAL_IDX >= 1 THEN -- 普通索引
            for i in (select *
                      from user_indexes
                      where table_name = upper(p_tab)
                        AND INDEX_NAME
                          NOT IN (SELECT INDEX_NAME FROM user_part_indexes))
                loop
                    v_sql := 'alter index ' || i.index_name || ' rebuild'; -- 将失效的普通索引重建
                    DBMS_OUTPUT.put_line(v_sql);
                    execute immediate v_sql;
                end loop;
        END IF;
        SELECT COUNT(*) INTO V_PART_IDX FROM user_part_indexes WHERE TABLE_NAME = 'PART_TAB';
        IF V_PART_IDX >= 1 THEN -- 分区索引
            for i in (SELECT *
                      from User_Ind_Partitions
                      WHERE index_name in (select index_name
                                           from user_part_indexes
                                           where table_name = upper(p_tab)))
                loop
                    v_sql := 'alter index ' || i.index_name || ' rebuild partition ' || i.partition_name; -- 将失效分区索引重建
                    DBMS_OUTPUT.put_line(v_sql);
                    execute immediate v_Sql;
                end loop;
        END IF;
    end p_rebuid_idx;

    procedure p_main(p_table_name varchar2)
    as
    begin
        for i in (select *
                  from (SELECT SUBSTR(s, INSTR(s, ',', 1, ROWNUM) + 1,
                                      INSTR(s, ',', 1, ROWNUM + 1) - INSTR(s, ',', 1, ROWNUM) - 1) AS TYPE_ID
                        FROM (SELECT ',' || p_table_name || ',' AS s FROM DUAL)
                        CONNECT BY ROWNUM <= 100)
                  WHERE type_id IS NOT NULL
            )
            loop
                -- 在外面SELECT再套一层是必须的，否则只会循环一次。另外type_id IS NOT NULL是必须的，否则会多循环
                DBMS_OUTPUT.put_line('当前处理的表为' || i.TYPE_ID);
                p_cal_bytes('未降低高水平位前', i.type_id);
                p_move_tab(i.type_id);
                p_rebuid_idx(I.TYPE_ID);
                p_cal_bytes('降低高水平位后', i.type_id);
            end loop;
    end p_main;
end pkg_shrink;

-- 编译
    alter package PKG_SHRINK compile reuse settings

-- 执行
BEGIN
    pkg_shrink.p_main('TABLE_NAME');
END;
~~~

---

检查统计信息

自动统计信息收集情况

~~~oraclesqlplus
-- 检查哪些对象的统计信息不够新，或者从未统计过（注意，让未统计过的在前面，即nulls first)。
-- 检查统计信息是否被收集
select t.JOB_NAME, t.PROGRAM_NAME, t.state, t.enabled
from dba_scheduler_jobs t
where job_name = 'GATHER_STATS_JOB';

-- 检查哪些未被收集或者很久没收集
select owner
     , table_name
     , t.last_analyzed
     , t.num_rows
     , t.blocks
     , t.object_type
from dba_tab_statistics t
where owner in ('TEST_USER')
  and (t.last_analyzed is null or t.last_analyzed < sysdate - 14)
order by t.last_analyzed nulls first;

-- 查看数量
select count(*)
from dba_tab_statistics t
where owner in ('TEST_USER')
  and (t.last_analyzed is null or t.last_analyzed < sysdate - 14);
~~~

全局临时表情况

~~~oraclesqlplus
-- 检查全局临时表有没有被收集统计信息
select owner
     , table_name
     , t.last_analyzed
     , t.num_rows
     , t.blocks
from dba_tables t
where t.temporary = 'Y'
  and owner in ('TEST_USER');

-- 相应的处理措施
BEGIN
    DBMS_STATS.DELETE_TABLE_STATS('TEST_USER', 'RN_IDENTIFICATION_BATCH'); -- 删除统计信息
    DBMS_STATS.LOCK_TABLE_STATS('TEST_USER', 'RN_IDENTIFICATION_BATCH'); -- 不收集统计信息
END;
~~~

---

awr addm ash awrddrpt awrsqrpt等方式观察数据库

~~~oraclesqlplus
exec dbms_workload_repository.create_snapshot();
@?/rdbms/admin/awrrpt.sql
@?/rdbms/admin/addmrpt.sql
@7/rdbms/admin/ashrpt.sql
@?/rdbms/admin/awrddrpt.sql
@?/rdbms/admin/awrsqrpt.sql
-- 注意：一般要考虑统计出问题的时间段的报表，顺序一般是 awr -> addm -> ash -> awrdd -> awrsq
~~~

这些命令和脚本用于生成和分析 Oracle 自动工作负载仓库 (AWR) 的报告。

1. `exec dbms_workload_repository.create_snapshot();`:
    - 该命令用于创建一个新的 AWR 快照。AWR 快照包含了数据库在某一时间段内的性能统计数据，这些数据可用于后续的性能分析。
    - 创建快照有助于记录当前数据库的工作负载状况，并为后续的性能对比提供基准。
2. `@?/rdbms/admin/awrrpt.sql`:
    - 此命令用于执行 AWR 报告生成脚本 `awrrpt.sql`。该脚本会生成一份详细的 AWR 报告，这份报告包含了数据库在指定时间段内的性能指标和统计数据。
    - AWR 报告是性能分析的基础，可以了解数据库的整体性能状况。
3. `@?/rdbms/admin/addmrpt.sql`:
    - 此命令用于执行 ADDM (自动数据库诊断监控器) 报告生成脚本 `addmrpt.sql`。该脚本会生成一份基于 AWR 数据的 ADDM 报告。
    - ADDM 报告提供了更深入的性能分析，包括性能问题的根本原因分析和优化建议。
4. `@7/rdbms/admin/ashrpt.sql`:
    - 此命令用于执行 ASH (自动共享历史) 报告生成脚本 `ashrpt.sql`。该脚本会生成一份基于 ASH 数据的报告。
    - ASH 报告提供了关于会话活动的详细信息，包括等待事件、SQL 执行等，这对于诊断性能瓶颈非常有用。
5. `@?/rdbms/admin/awrddrpt.sql`:
    - 此命令用于执行 AWR 数据字典报告生成脚本 `awrddrpt.sql`。该脚本会生成一份关于 AWR 数据字典的报告。
    - AWR 数据字典报告提供了关于 AWR 表的详细信息，这有助于理解 AWR 数据的结构。
6. `@?/rdbms/admin/awrsqrpt.sql`:
    - 此命令用于执行 AWR SQL 报告生成脚本 `awrsqrpt.sql`。该脚本会生成一份关于 SQL 语句执行性能的报告。
    - AWR SQL 报告提供了 SQL 语句的性能统计数据，包括执行次数、CPU 时间等，这对于优化 SQL 语句的性能非常有用。

---

获取数据库告警和监听日志

~~~shell
lsnrctl status # 可获取监听的路径
~~~

~~~oraclesqlplus
show parameter ump -- 可获取告警日志的路径
-- 文件很大的情况下，可以考虑 tail -n 50000 alert* > alert.log 的方式获取最近5万条记录
-- 监听也是类似 tail -n 50000 list* > listener.log
~~~

---

检查日志大小设置情况

~~~oraclesqlplus
-- 一般情况下，建议单个RED0设置为5GB大，如果发现告警日志切换频繁，则应该立即调整
select inst_id, group#, member
from gv$logfile;

select group#, bytes, status
from v$log;
~~~

---

检查最大的对象是哪些、表空间的使用情况及回收站情况

~~~oraclesqlplus
-- 用户的权限情况
select *
from dba_role_privs
where grantee = 'TEST_USER';

-- 最大的前20个对象（然后再进一步COUNT(*)统计其记录数）
select *
from (select owner
           , segment_name
           , segment_type
           , sum(bytes) / 1024 / 1024 / 1024 object_size
      from DBA_segments
      WHERE owner in ('TEST_USER')
      group by owner, segment_name, segment_type
      order by object_size desc)
where rownum < 50;

-- 表空间使用情况
select a.tablespace_name                                    "表空间名"
     , a.total_space                                        "总空间(g)"
     , nvl(b.free_space, 0)                                 "剩余空间(g)"
     , a.total_space - nvl(b.free_space, 0)                 "使用空间(g)"
     , trunc(nvl(b.free_space, 0) / a.total_space * 100, 2) "剩余百分比%"
from (select tablespace_name
           , trunc(sum(bytes) / 1024 / 1024 / 1024, 2) total_space
      from dba_data_files
      group by tablespace_name) a
   , (select tablespace_name
           , trunc(sum(bytes / 1024 / 1024 / 1024), 2) free_space
      from dba_free_space
      group by tablespace_name) b
where a.tablespace_name = b.tablespace_name(+)
order by 5;

-- 整个用户有多大（比如 TEST_USER 用户）
select sum(bytes) / 1024 / 1024 / 1024 "G"
from dba_segments
where owner = 'TEST_USER';

-- 回收站情况
select SUM(BYTES) / 1024 / 1024 / 1024
from DBA_SEGMENTS
WHERE owner = 'TEST_USER'
  AND SEGMENT_NAME LIKE 'BINS%';

-- 分区最多的前20个对象（先知道表就可以大概了解了，索引可以后续再观察）
select *
from (select table_owner, table_name, count(*) cnt
      from dba_tab_partitions
      WHERE table_owner in ('TEST_USER')
      group by table_owner, table_name
      order by cnt desc)
where rownum < 20;
~~~

#### 静态局部

检查有哪些函数索引或者位图索引

~~~oraclesqlplus
-- 检查有哪些函数索引或者位图索引（大多数情况下开发人员对这两类索引是使用不当的，所以需要捞出来确认一下)
select t.owner
     , t.index_name
     , t.index_type
     , t.status
     , t.blevel
     , t.leaf_blocks
from dba_indexes t
where index_type in ('BITMAP', 'FUNCTION-BASED NORMAL')
  and owner in ('TEST_USER');
~~~

---

检查CACHE小于20的序列

~~~oraclesqlplus
-- 检查序CACHE小于20的序列的情况（一般情况下可将其增至1000左右，序列默认的20太小）
select t.sequence_name
     , t.cache_size
     , 'alter sequence ' || t.sequence_owner || '.' || t.sequence_name || ' cache 1000;'
from dba_sequences t
where sequence_owner in ('TEST_USER')
  AND CACHE_SIZE < 20;
~~~

---

分析需要跟踪的表和索引的情况

查看表大小情况

~~~oraclesqlplus
-- 记录的大小
select count(*)
from TANBLE_NAME;

-- 物理的大小
select segment_name, sum(bytes) / 1024 / 1024
from user_segments
where segment_name in ('TANBLE_NAME')
group by segment_name;
~~~

查看表结构情况

~~~oraclesqlplus
-- 查看表信息
select t.table_name
     , t.num_rows
     , t.blocks
     -- t.empty_blocks, --统计信息不收集这个字段，所以不需要这个字段了
     , t.degree
     , t.last_analyzed
     , t.temporary
     , t.partitioned
     , t.pct_free
     , t.tablespace_name
from user_tables t
where table_name in ('TABLE_NAME');

-- 查看分区表相关信息
-- 查看分区表相关信息(user_part_tables记录分区的表的信息，user_tab_partitions记录表的分区的信息)
-- 以下了解这些表的分区是什么类型的，有多少个分区
select t.table_name
     , t.partitioning_type
     , t.partition_count
from user_part_tables t
where table_name in ('TABLE_NAME');

-- 以下了解这些表以什么列作为分区
Select name
     , object_type
     , column_name
from user_part_key_columns
where name in ('TABLE_NAME');

-- 以下了解这些表的分区范围是多少
SELECT table_name, partition_name, high_value, tablespace_name
FROM user_tab_partitions t
where table_name in ('TABLE_NAME')
order by table_name, t.partition_position;
~~~

每张表对应有多少个索引，物理多大

~~~oraclesqlplus
select t2.table_name
     , t1.segment_name
     , sum(t1.bytes) / 1024 / 1024
from user_segments t1
   , user_indexes t2
where t1.segment_name = t2.index_name
  and t1.segment_type like '%INDEX%'
  and t2.table_name in ('T1')
group by t2.table_name, t1.segment_name
order by table_name;

-- 结构情况（高度、重复度、并行度、叶子高度、聚合因子、记录数、状态、最近分析时间...）
select t.table_name
     , t.index_name
     , t.num_rows
     , t.index_type
     , t.status
     , t.clustering_factor
     , t.blevel
     , t.distinct_keys
     , t.leaf_blocks
     , t.uniqueness
     , t.degree
     , t.last_analyzed
from user_indexes t
where table_name in ('TABLE_NAME');
~~~

查看索引列信息

~~~oraclesqlplus
-- 以下可以查出来的是索引的列是什么（无论分区表和非分区表都可以查出）
select t.table_name, t.index_name, t.column_name, t.column_position, t.DESCEND
from user_ind_columns t
where table_name in ('TABLE_NAME')
order by table_name, index_name, column_position;

-- 以下查出的都是分区索引
select table_name, index_name, partitioning_type, partition_count
from user_part_indexes
where table_name in ('TABLE_NAME')
order by table_name, index_name;

select index_name, partition_name, status, blevel, leaf_blocks
from user_ind_partitions
where index_name in
      (select index_name
       from user_indexes
       where table_name in ('TABLE_NAME'));
~~~

### 开发规范 让开发者驾轻就熟

#### sql 编写规范

单条SQL长度不宜超过100行

~~~oraclesqlplus
-- 判断过长 sql
select sql_id, count(*)
from v$sqltext
group by sql_id
having count(*) >= 100
order by count(*) desc;
~~~

---

SQL子查询嵌套不宜超过3层
一般来说，子查询嵌套如果超过3层，容易导致$QL语句的解析过于复杂，导致产生错误的执行计划。此外子查询嵌套过多，一般适宜分解成更简单的多条SQL。

---

SQL表关联需考虑连接和限制条件的索引

~~~oraclesqlplus
drop table t purge;
create table t as
select *
from v$sql_plan;

-- 使用Nested Loops Join但是未用到索引的，比较可疑
select *
from t
where sql_id not in (select sql_id
                     from t
                     where sql_id in (select sql_id from t where operation = 'NESTED LOOPS')
                       and (operation like '%INDEX%' or object_owner like '%SYS%'))
  and sql_id in (select sql_id from t where operation = 'NESTED LOOPS');
~~~

---

尽量避免HNT在代码中出现

~~~oraclesqlplus
-- 找出非SYS用户用HINT的所有SQL来分析
select sql_text
     , sql_id
     , module
     , t.service
     , first_load_time
     , last_load_time
     , executions
     , service
from v$sql t
where sql_text like '%/*+%'
  and t.SERVICE not like 'SYS$%';
~~~

---

同一SQL模块避免出现大量相似之处
这种SQL写法一般比较可疑，一般可以优化，比如 WITH 子句等等，所以出现后需引起注意。

---

用到并行度需谨慎

表和索引属性设置并行
找出被设置成并行属性的表和索引，并修正

~~~oraclesqlplus
select t.owner, t.table_name, degree
from dba_tables t
where t.degree > '1';

select t.owner, t.table_name, index_name, degree, status
from dba_indexes t
where owner in ('TEST_USER')
  and t.degree > '1';

-- 有问题就要处理，比如索引有并行，就处理如下：
select 'alter index ' || t.owner || '.' || index_name || ' noparallel;'
from dba_indexes t
where owner in ('TEST_USER')
  and t.degree > '1';
~~~

SQL中 HINT 的并行设置
属性未设并行，但是 HINT 设并行的SQL

~~~oraclesqlplus
select sql_text
     , sql_id
     , module
     , service
     , first_load_time
     , last_load_time
     , executions
from v$sql t
where sql_text like '%parall%'
  and t.SERVICE not like 'SYS$%';
~~~

---

尽量避免对列进行运算
捞取对列进行运算的SQL

~~~oraclesqlplus
select sql_text
     , sql_id
     , module
     , t.service
     , first_load_time
     , last_load_time
     , executions
from v$sql t
where (upper(sql_text) like '%TRUNC%'
    or upper(sql_text) like '%TO_DATE%'
    or upper(sql_text) like '%SUBSTR%')
  and t.SERVICE not like 'SYS$%';
~~~

#### PL/SQL 编写规范

注释不少于代码的十分之一
注释如果过少，将容易导致开发者后续忘记代码的逻辑，尤其是对新人交接很不利，一般建议注释不少于代码的十分之一。
捞取注释少于代码十分之一的程序

~~~oraclesqlplus
select *
from (select name
           , t.type
           , sum(case when text like '%--%' then 1 else 0 end) / count(*) rate
      from user_source t
      where type in ('package body', 'procedure', 'function') -- 包头就算了
      group by name, type
      having sum(case when text like '%-%' then 1 else 0 end) / count(*) <= 1 / 10)
order by rate;
~~~

---

代码必须提供最小化测试案例于注释中
这是一个值得推崇的好习惯，对新人接手熟悉程序尤为有用。

---

绑定变量

相似语句需考虑绑定变量
这里就不提供脚本了，在前面的“检查系统使用绑定变量的情况”中已提供代码。

动态SQL最容易遗忘绑定变量
一般来说，动态SQL未用绑定变量的情况多半是因为未使用 USING 关键字，所以可用如下脚本来搜索可疑的未用绑定变量的动态SQL。
动态SQL未用 USING 有可能未用绑定变量

~~~oraclesqlplus
select *
from user_source
where name in
      (select name
       from user_source
       where name in (select name from user_source where UPPER(text) like '%EXECUTE IMMEDIATE%'))
  and name in
      (select name from user_source where name in (select name from user_source where UPPER(text) like '%||%'))
  and name not in
      (select name from user_source where name in (select name from user_source where upper(text) not like '%USING%'));
~~~

---

尽量使用批量提交
未使用批量提交，一般都是因为将 commit 写到了循环内。以下语句可查出单个 session 提交次数超过10000次的情况，这么多次很可疑，应该捞取出来进行分析。
查询提交次数过多的 SESSION

~~~oraclesqlplus
select t1.sid, t1.value, t2.name
from v$sesstat t1
   , v$statname t2
--where t2.name like '%commit%'
where t2.name like '%user commits%' --可以只选user commits,其他系统级的先不关心
  and t1.STATISTIC# = t2.STATISTIC#
  and value > 10000
order by value desc;
~~~

---

同一过程包中出现重复逻辑块需封装，统一调用
这是封装的概念，否则修改统一逻辑，代码可能需要修改多处，不利于维护。

---

生产环境尽量使用包来封装过程和函数
一般来说，只要是正式的产品，就必须使用包。
查询未用包的程序逻辑

~~~oraclesqlplus
select distinct name, type
from user_source
where type in ('PROCEDURE', 'FUNCTION')
order by type;
~~~

---

动态SQL编写需设法保存真实SQL
动态SQL编写最大的麻烦在于调试困难，因为语句是拼装组合而成的，无论是出现该语句的语法错误还是性能问题，都无法被有效跟踪到。
此时考虑将拼装成的$QL记录在某张表里，将会给调试跟踪带来极大的方便。

### 设计规范 助设计者运筹帷幄

#### 表规范

范式

1. 绝大部分场景要遵循第三范式。减少数据冗余
2. 适当场景考虑反范式。为提高性能

---

不同类表的要点差异

1. 小表（参数配置表）
    - 一般需要有主键。
    - 一般需要有约束。
    - 尽量规划在同一表空间。
2. 大表（业务表及日志表）
    - 尺寸超过10GB需考虑建分区
    - 分区表中分区个数超过100要注意
    - 大表尽量要有明确的数据保留策略
        - 体现在设计文档。
        - 实现步骤体现在维护脚本中。
        - 体现在表注释中。
    - 大表坚决不允许有触发器

~~~oraclesqlplus
-- 表大小超过10GB未建分区的
select owner
     , segment_name
     , segment_type
     , sum(bytes) / 1024 / 1024 / 1024 object_size
from dba_segments
WHERE segment_type = 'TABLE' -- 此处说明是普通表，不是分区表，如果是分区表，类型是TABLE PARTITION
group by owner, segment_name, segment_type
having sum(bytes) / 1024 / 1024 / 1024 >= 10
order by object_size desc;

-- 分区个数超过100个的表
select table_owner, table_name, count(*) cnt
from dba_tab_partitions
WHERE table_owner in ('TEST_USER')
having count(*) >= 100
group by table_owner, table_name
order by cnt desc;

-- 表大小超过10GB，有时间字段，可以考虑在该列上建立分区
-- 超过10GB的大表没有时间字段
select T1.*, t2.column_name, t2.data_type
from (select segment_name
           , segment_type
           , sum(bytes) / 1024 / 1024 / 1024 object_size
      from user_segments
      WHERE segment_type = 'TABLE' --此处说明是普通表，不是分区表，如果是分区表，类型是TABLE PARTITION
      group by segment_name, segment_type
      having sum(bytes) / 1024 / 1024 / 1024 >= 0.01
      order by object_size desc) t1
   , user_tab_columns t2
where t1.segment_name = t2.table_name(+)
  and t2.DATA_TYPE = 'DATE'
-- 来说明这个大表有时间列

-- 上述语句和下面的语句进行观察比较 下面只是过滤了大小
select segment_name
     , segment_type
     , sum(bytes) / 1024 / 1024 / 1024 object_size
from user_segments
WHERE segment_type = 'TABLE' -- 此处说明是普通表，不是分区表，如果是分区表，类型是TABLE PARTITION
group by segment_name, segment_type
having sum(bytes) / 1024 / 1024 / 1024 >= 0.01
order by object_size desc;

-- 找出有建触发器的表，同时观察该表多大
select trigger_name, table_name, tab_size
from user_triggers t1
   , (select segment_name, sum(bytes / 1024 / 1024 / 1024) tab_size
      from user_segments t
      where t.segment_type = 'TABLE'
      group by segment_name) t2
where t1.TABLE_NAME = t2.segment_name;
~~~

注：
触发器是一种存储在数据库中的程序，它定义了一组SQL语句，当特定的事件发生时自动执行这组SQL语句。
这些事件通常是数据操作语言（DML）事件，如INSERT、UPDATE或DELETE操作。触发器可以用来强制执行复杂的业务规则或者维护数据完整性，例如级联更新或删除相关的行，或者记录审计日志等。

为什么大表不要有触发器？

1. **性能影响**：
    - 当对大表进行大量的DML操作时，触发器会在每个受影响的行上被执行，这会导致额外的CPU和I/O负载。如果触发器内含有复杂的逻辑或者需要访问其他表，则性能影响会更加严重。
    - 在高并发环境下，多个事务同时尝试修改大表中的数据，触发器的执行可能导致更多的锁等待，从而增加事务处理的时间。
2. **可扩展性问题**：
    - 随着表的增长，触发器的开销也会变得越来越显著。对于大规模的数据修改操作，触发器可能导致长时间的锁定，进而影响整个系统的响应时间和吞吐量。
3. **维护复杂性**：
    - 触发器使得数据库逻辑变得复杂，特别是在涉及多表或多步骤操作的情况下。维护触发器代码的正确性和效率也变得更加困难。

---

表结构

1. 注释
    - 表必须要有注释
    - 列尽量要有注释
2. 列类型
    - 避免使用LONG字段。可以说，现在的应用中，LONG字段几乎是有百害而无一利，所以尽量要杜绝在设计中出现LONG,一般考虑CLOB字段来替代。
    - 避免用CHAR字段。CHAR字段的应用场合非常少，一般现在都考虑用VARCHAR2来替代。
    - 列类型和值尽量匹配
        - 时间取值放入 date 列。
        - 数字取值放入 number 列。
        - 字符串取值放入 varchar2 列。

~~~oraclesqlplus
-- 查询那些表未做注释
select TABLE_NAME, T.TABLE_TYPE
from USER_TAB_COMMENTS T
where table_name not like 'BIN$%'
  and comments is null
order by table_name;

-- 查询哪些列未做注释（仅供参考)
select TABLE_NAME, COLUMN_NAME
from USER_COL_COMMENTS
where table_name not like 'BIN$%'
  and comments is null
order by table_name;

-- 查询哪些列是LONG类型
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM user_tab_columns
WHERE DATA_TYPE = 'LONG'
ORDER BY 1, 2;

-- 查询哪些列是CHAR类型
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM user_tab_columns
WHERE DATA_TYPE = 'CHAR'
ORDER BY 1, 2;
~~~

#### 索引规范

用不上分区条件的局部索引不宜建
分区表建了分区索引后，如果在查询应用中无法用到这个分区索引列的条件，索引读将可能遍历所有的分区。
如果有100个分区，相当于遍历了100个小索引，将会严重影响性能，此时需要慎重考虑，判断是否需要修改为全局索引。

---

函数索引大多用于列运算，一般需要避免
从实际应用情况来分析，应用函数索引大多是因为设计阶段考虑步骤，比如 trunc(时间列) 的写法，往往可以轻易转换成去掉 trunc
的写法，所以需要捞取出来验证。

~~~oraclesqlplus
-- 查询哪些索引是函数索引
select t.index_name
     , t.index_type
     , t.status
     , t.blevel
     , t.leaf_blocks
from user_indexes t
where index_type in ('FUNCTION-BASED NORMAL');
~~~

---

位图索引遇到更新将是噩梦，需谨慎设计

1. 位图索引不适合用在表频繁更新的场合。
2. 位图索引不适合在所在列重复度很低的场合。

因为位图索引的应用比较特殊，适用场合比较少，因此有必要捞取出系统中的位图索引，进行核对检测。

~~~oraclesqlplus
-- 查询哪些索引是位图索引
select t.index_name
     , t.index_type
     , t.status
     , t.blevel
     , t.leaf_blocks
from user_indexes t
where index_type in ('BITMAP');
~~~

---

外键未建索引将引发死锁及影响表连接性能
外键未建索引，将有可能导致两个严重的问题：一是**更新相关的表产生死锁**；二是**两表关联查询时性能低下**。
因此设计中需要谨慎考虑。

~~~oraclesqlplus
-- 查询外键未建索引的表有哪些
select table_name
     , constraint_name
     , cname1 || nvl2(cname2, ',' || cname2, null) ||
       nvl2(cname3, ',' || cname3, null) ||
       nvl2(cname4, ',' || cname4, null) ||
       nvl2(cname5, ',' || cname5, null) ||
       nvl2(cname6, ',' || cname6, null) ||
       nvl2(cname7, ',' || cname7, null) ||
       nvl2(cname8, ',' || cname8, null) columns
from (select b.table_name
           , b.constraint_name
           , max(decode(position, 1, column_name, null)) cname1
           , max(decode(position, 2, column_name, null)) cname2
           , max(decode(position, 3, column_name, null)) cname3
           , max(decode(position, 4, column_name, null)) cname4
           , max(decode(position, 5, column_name, null)) cname5
           , max(decode(position, 6, column_name, null)) cname6
           , max(decode(position, 7, column_name, null)) cname7
           , max(decode(position, 8, column_name, null)) cname8
           , count(*)                                    col_cnt
      from (select substr(table_name, 1, 30)      table_name
                 , substr(constraint_name, 1, 30) constraint_name
                 , substr(column_name, 1, 30)     column_name
                 , position
            from user_cons_columns) a
         , user_constraints b
      where a.constraint_name = b.constraint_name
        and b.constraint_type = 'R'
      group by b.table_name, b.constraint_name) cons
where col_cnt > ALL
      (select count(*)
       from user_ind_columns i
       where i.table_name = cons.table_name
         and i.column_name in (cname1, cname2, cname3, cname4, cname5,
                               cname6, cname7, cname8)
         and i.column_position <= cons.col_cnt
       group by i.index_name);
~~~

---

建联合索引需谨慎

要结合单列查询考虑，决定前缀
如：既可以建立col1,col2的联合索引，又可以建立col2,col1的联合索引，此时如果存在col1列单独查询较多的情况下，一般倾向于建立col1,col2的联合索引。

范围查询影响组合索引
组合查询中，如果有等值条件和范围条件组合的情况，等值条件在前，性能更高。
如：where col1=2 and col2>=100 and col2<=120,此时是col1,col2的组合索引性能高过col2,col1的组合索引。

~~~oraclesqlplus
-- 将有不等值查询的SQL捞取出来分析
select sql_text
     , sql_id
     , service
     , module
     , t.first_load_time
     , t.last_load_time
from v$sql t
where (sql_text like '%>%' or sql_text like '%<%' or sql_text like '%<>%')
  and sql_text not like '%=>%'
  and service not like 'SYS$%';
~~~

需考虑回表因素
一般情况下，如果建索引可以避免回表（在索引中即可完成检测），也可考虑对多列建组合索引，不过组合索引列不宜超过4个。

超过4个字段的联合索引需注意

~~~oraclesqlplus
-- 捞取超过4个字段组合的联合索引
select table_name, index_name, count(*)
from user_ind_columns
group by table_name, index_name
having count(*) >= 4
order by count(*) desc;
~~~

---

单表索引个数需控制

索引个数超过5个以上的
超过5个以上的索引，在表的记录很大时，将会极大地影响该表的更新，因此在表中建索引时需要谨慎考虑。

~~~oraclesqlplus
-- 单表的索引个数超过5个需注意
select table_name, count(*)
from user_indexes
group by table_name
having count(*) >= 5
order by count(*) desc;
~~~

建后2个月内从未使用过的索引
一般来说，在2个月内从未被用到的索引是多余的索引，可以考虑删除。

~~~oraclesqlplus
-- 跟踪索引的使用情况，控制索引的数量
select 'alter index ' || index_name || ' monitoring usage;'
from user_indexes;

-- 然后观察：
select *
from v$object_usage;

-- 停止对索引的监控，观察v$object_usage状态变化（以某索引IDX_OBJECT_ID为例）
alter index IDX_OBJECT_ID nomonitoring usage;
~~~

---

单表无任何索引需重视
单表无任何索引的情况一般比较少见，可以捞取出来，再结合SQL应用进行分析，观察该表的大小以及是否有时间字段及编码字段这样的适宜建索引的列。

~~~oraclesqlplus
-- 查询无任何索引的表
select table_name
from user_tables
where table_name not in (select table_name from user_indexes);
~~~

---

需注意索引的失效情况

1. 对表进行move操作，会导致索引失效，操作需考忠索引的重建。
2. 对分区表进行系列操作，如 split、drop、truncate 分区时，容易导致分区表的全局索引失效，需要考虑增加`update global indexes`
   的关键字进行操作，或者重建索引。
3. 分区表SPLIT的时候，如果MAX区中已经有记录了，这个时候SPLIT就会导致有记录的新增分区的局部索引失效。

普通表及分区表的全局索引失效

~~~oraclesqlplus
-- 查询失效的普通索引
select index_name, table_name, tablespace_name, index_type
from user_indexes
where status = 'UNUSABLE';
~~~

分区表局部索引失效

~~~oraclesqlplus
-- 查询失效的分区局部索引
select t1.index_name
     , t1.partition_name
     , t1.global_stats
     , t2.table_name
     , t2.table_type
from user_ind_partitions t1
   , user_indexes t2
where t2.index_name = t1.index_name
and t1.status ='UNUSABLE';
~~~

#### 环境参数规范

数据库参数

SGA及PGA参数

OLTP应用是主机内存的80%分配数据库，其中 SGA80%,PGA20%。
OLAP应用是主机内存的80%分配数据库，其中 SGA50%,PGA50%。
如OLTP应用：主机内存30GB,SGA即是 30 X 0.8 X 0.8 = 20GB 左右。
不过这里还是要注意：并没有什么黄金参数，这些还只能是参考。

PROCESS/SESSION

~~~oraclesqlplus
-- 默认连接数是150，这对大多数应用都无法满足，大型应用一般不少于1000个。
show parameter process
show parameter session

select count(*)
from v$process;

select count(*)
from v$session;
~~~


OPEN_CURSOR游标参数

~~~oraclesqlplus
-- 默认open_cursors是300，大型应用需设置1000以上，原则上不超过PROCESS设置。
show parameter open_cursor
~~~

日志参数
一般来说，Oracle默认的日志参数是3组，大小为500MB,在实际较大的生产应用中往往不够，需要至少考虑在5组以上，大小在1GB以上。

~~~oraclesqlplus
-- 生产系统大多需要开启归档。
archive log list
~~~

---

表空间规划

1. 回滚表空间
   - 自动管理。
   - 避免自动扩展。
   - 尽可能规划大一些。 
2. 临时表空间
   - 避免自动扩展。
   - 尽可能大。
   - 尽可能使用临时表空间组。 
3. 业务表空间
   - 控制个数，不超过6个为宜。
   - 尽量避免自动扩展，超阀值由监控来检查。
   - 根据自己的业务，固定表空间名。
   - 表空间需良好分类（参数配置表，业务数据表，历史记录表）。
   - 表空间需合理命名。

---

RAC系统

1. 尽量采用BALANCE模式，保证两节点压力大致相当。
2. 可适当考虑不同类型的业务部署在不同的节点上，避免RAC的CACHE争用。
3. 尽量考虑不同的节点使用不同的临时表空间。

#### 命名规范

只是示范，一般都有自己的命名方式，但团队要有统一的规范。

~~~oraclesqlplus
-- 查询表的前缀是否以t_开头
select*
from user_tables
where substr(table_name, 1, 2) <> 'T_';

-- 查询视图的前缀是否以v_开头
select view_name
from user_views
where substr(view_name, 1, 2) <> 'V_';

-- 查询同义词的前缀是否以s_开头
select synonym_name, table_owner, table_name
from user_synonyms
where substr(synonym_name, 1, 2) <> 'S_';

-- 查询簇表的前缀是否以c_开头
select t.cluster_name, t.cluster_type
from user_clusters t
where substr(cluster_name, 1, 2) <> 'C_';

-- 查询序列的前缀是否以seq开头或结尾
select sequence_name, cache_size
from user_sequences
where sequence_name not like '%SEQ%';

-- 查询存储过程是否以p_开头
select object_name, procedure_name
from user_procedures
where object_type = 'PROCEDURE'
  and substr(object_name, 1, 2) <> 'P_';

-- 查询函数是否以f_开头
select object_name, procedure_name
from user_procedures
where object_type = 'FUNCTION'
  and substr(object_name, 1, 2) <> 'F_';

-- 查询包是否以pkg开头
select object_name, procedure_name
from user_procedures
where object_type = 'PACKAGE'
  and substr(object_name, 1, 4) <> 'PKG';

-- 查询类是否以typ开头
select object_name, procedure_name
from user_procedures
where object_type = 'TYPE'
  and substr(object_name, 1, 4) <> 'TYP';

-- 查询主键是否以pk_开头
select constraint_name, table_name
from user_constraints
where constraint_type = 'p'
  and substr(constraint_name, 1, 3) <> 'PK_'
  and constraint_name not like 'BINS%';

-- 查询外键是否以fk_开头
select constraint_name, table_name
from user_constraints
where constraint_type = 'R'
  and substr(constraint_name, 1, 3) <> 'FK_'
  and constraint_name not like 'BINS%';

-- 查询唯一索引是否以ux_开头
select constraint_name, table_name
from user_constraints
where constraint_type = 'U'
  and substr(constraint_name, 1, 3) <> 'UX_'
  and table_name not like 'BINS%';

-- 查询普通索引是否以idx_开头
select index_name, table_name
from user_indexes
where index_type = 'NORMAL'
  and uniqueness = 'NONUNIQUE'
  and substr(index_name, 1, 4) <> 'IDX_'
  and table_name not like 'BINS%';

-- 查询位图索引是否以bx_开头
select index_name, table_name
from user_indexes
where index_type LIKE '%BIT%'
  and substr(index_name, 1, 3) <> 'BX_'
  and table_name not like 'BINS%';

-- 查询函数索引是否以fx_开头
select index_name, table_name
from user_indexes
where index_type = 'FUNCTION-BASED NORMAL'
  and substr(index_name, 1, 3) <> 'FX_'
  and table_name not like 'BINS%';
~~~

### END

终于是结束了，算是第一本静下心来读完的技术相关的书。
从git提交记录也可以看出，读了快两个月，中间有半个多月的空窗。是有点看不到下去了，是最艰难的索引章节，一章就占了全书的四分之一还多。
前面体系结构、逻辑结构里的sql还能基本都在自己搭的测试环境中验证下，但到索引很多都没有去验证，实在是太多了。算是个偷懒的地方吧，不过最后还是读完了。

这本书的作者 梁敬彬、梁敬弘 后面还写了一本 《收获，不止SQL优化》，等缓一缓，后面肯定会继续读的。
先整点非技术相关的书，或者非数据库相关的书调节一下。
就这样，Bye
