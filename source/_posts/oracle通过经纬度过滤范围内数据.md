---
layout: post
title: oracle通过经纬度过滤范围内数据
date: 2025-03-26 10:54:15
tags:
  - oracle
  - 经纬度
  - 地图
  - WGS84坐标系
categories:
  - 编程记录
---

## Start

今天的需求是在地图上撒了很多点，右击这个点时，可以选择一个半径，呈现在这个半径范围内的点。
和之前一个在地图上框选多边形区域的需求一样，需要通过经纬度来计算过滤数据。

这里是通过 Oracle 的空间运算符实现的。
主要使用下面两个：

1. [SDO_WITHIN_DISTANCE](https://docs.oracle.com/en/database/oracle/oracle-database/23/spatl/sdo_within_distance.html)
   Identifies the set of spatial objects that are within some specified distance of a given object, such as an area of interest or point of interest.
   标识位于给定对象（如感兴趣区域或感兴趣点）的某个指定距离内的空间对象集。
2. [SDO_INSIDE](https://docs.oracle.com/en/database/oracle/oracle-database/23/spatl/sdo_inside.html)
   Checks if any geometries in a table have the INSIDE topological relationship with a specified geometry. Equivalent to specifying the SDO_RELATE operator with 'mask=INSIDE'.
   检查表中的任何几何是否与指定几何具有 INSIDE 拓扑关系。等效于使用 'mask=INSIDE' 指定 SDO_RELATE 运算符。

## 需求实现

首先需要确保表中有经纬度的字段和数据，并且不为空。

~~~oraclesqlplus
delete
from T_GIS
where LONGITUDE is null
   or LATITUDE is null;
~~~

然后需要新建一个字段，为存储空间类型。存储经纬度转换后的数据。

~~~oraclesqlplus
alter table T_GIS
    add POINT_GEOMETRY SDO_GEOMETRY
~~~

将转换后的经纬度存储到这个字段中。

~~~oraclesqlplus
UPDATE T_GIS a
SET a.POINT_GEOMETRY = SDO_GEOMETRY(
        2001, -- 点类型
        8307, -- WGS84 坐标系
        SDO_POINT_TYPE(a.LONGITUDE, a.LATITUDE, NULL), -- 点坐标
        NULL, -- 无元素信息
        NULL -- 无坐标数组
                       )
where LONGITUDE is not null
  and LATITUDE is not null;
~~~

然后需要为这个字段创建空间索引。

~~~oraclesqlplus
DROP INDEX T_GIS_SPATIAL_IDX;

CREATE INDEX T_GIS_SPATIAL_IDX
    ON T_GIS (POINT_GEOMETRY)
    INDEXTYPE IS MDSYS.SPATIAL_INDEX;
~~~

然后就可以使用 SDO_WITHIN_DISTANCE 来查询了。

~~~oraclesqlplus
select *
from T_GIS a
where a.POINT_GEOMETRY is not null
  and a.LONGITUDE is not null
  and a.LATITUDE is not null
  and SDO_WITHIN_DISTANCE(
              a.POINT_GEOMETRY,
              SDO_GEOMETRY(
                      2001, -- 点类型
                      8307, -- WGS84 坐标系
                      SDO_POINT_TYPE(104.48060937499996, 36.30556423523153, NULL), -- 点坐标 (经度, 纬度, 高度)
                      NULL, -- 无元素信息
                      NULL -- 无坐标数组
              ),
              'DISTANCE=1000'
      ) = 'TRUE';
~~~

如果报错，可以使用下面的语句查看异常数据：

~~~oraclesqlplus
SELECT *
FROM T_GIS
WHERE SDO_GEOM.VALIDATE_GEOMETRY_WITH_CONTEXT(POINT_GEOMETRY, 0.005) != 'TRUE';
~~~

## WGS84 坐标系

WGS84（**World Geodetic System 1984**）是目前全球最广泛使用的 **大地坐标系（Geodetic Coordinate System）**，由美国国防部（DoD）制定，用于 **GPS 定位、地图绘制、GIS 系统** 等场景。

- WGS84 是一个 **地球参考坐标系**，用于描述地球表面点的位置（经度、纬度、高程）。
- 它基于 **椭球体模型**（参考椭球），并定义了地球的形状、大小和重力场。

### 核心参数

| 参数              | 值                        | 说明                |
|-----------------|--------------------------|-------------------|
| **椭球体长半轴（a）**   | 6,378,137 米              | 赤道半径              |
| **椭球体短半轴（b）**   | 6,356,752.3142 米         | 极半径               |
| **扁率（f）**       | 1/298.257223563          | `f = (a - b) / a` |
| **第一偏心率平方（e²）** | 0.00669437999014         | 用于坐标转换            |
| **地球自转角速度（ω）**  | 7.292115 × 10⁻⁵ rad/s    | 影响重力场计算           |
| **地心引力常数（GM）**  | 3.986004418 × 10¹⁴ m³/s² | 用于卫星轨道计算          |

### 坐标表示
WGS84 使用 **经度（Longitude）、纬度（Latitude）、高程（Height）** 表示位置：

- **经度（λ）**：东经（0°~180°E）或西经（0°~180°W）。
- **纬度（φ）**：北纬（0°~90°N）或南纬（0°~90°S）。
- **高程（h）**：相对于 WGS84 椭球面的高度（单位：米）。

### WGS84 的常见用途

1. GPS 定位
   - 全球定位系统（GPS）默认使用 WGS84 坐标系。
   - 手机、车载导航、无人机等设备的定位数据通常基于 WGS84。
2. 地图服务
   - **Google Maps、百度地图、高德地图** 等在线地图的底层数据采用 WGS84。
   - 但部分地图（如中国 GCJ-02）会对 WGS84 进行加密偏移。
3. GIS 和空间数据库
   - **Oracle Spatial、PostGIS、ArcGIS** 等支持 WGS84 坐标系。
   - 在 Oracle 中，WGS84 的 SRID（空间参考 ID）通常为：
       - **4326**（标准 WGS84，经纬度顺序：纬度, 经度）
       - **8307**（WGS84，经纬度顺序：经度, 纬度）

### WGS84 与其他坐标系的区别

WGS84 是全通通用的、无偏移的 GPS 原始数据，美国标准。GPS、谷歌地图等使用。
GCJ-02 对 WGS84 进行非线性偏移。在中国国内使用，高德地图、腾讯地图等使用。
CGCS2000 是中国标准，中国官方测绘。

> 注：CGCS2000 和 WGS84 在 **厘米级精度** 下可以视为一致，但在高精度测量（如卫星定位）时需转换。


## Oracle Spatial 函数（部分）

### SDO_GEOMETRY

SDO_GEOMETRY 是 Oracle Spatial 的核心数据类型，用于存储空间数据。

基本语法

~~~oraclesqlplus
SDO_GEOMETRY(
    geometry_type  NUMBER,        -- 几何类型代码
    srid          NUMBER,        -- 空间参考系ID
    point         SDO_POINT_TYPE,-- 点坐标(仅用于点类型)
    elem_info     SDO_ELEM_INFO_ARRAY, -- 元素定义数组
    ordinates     SDO_ORDINATE_ARRAY   -- 坐标值数组
)
~~~

几何类型代码

| 代码   | 类型说明   |
|------|--------|
| 2001 | 点      |
| 2002 | 线      |
| 2003 | 多边形    |
| 2005 | 多点集合   |
| 2006 | 多线集合   |
| 2007 | 多多边形集合 |

创建点

~~~oraclesqlplus
-- 创建WGS84坐标系的点(经度120.5，纬度30.2)
SELECT SDO_GEOMETRY(
    2001,         -- 点类型
    8307,         -- WGS84坐标系SRID
    SDO_POINT_TYPE(120.5, 30.2, NULL), -- 经度,纬度,高程
    NULL,
    NULL
) FROM dual;
~~~

创建线

~~~oraclesqlplus
-- 创建由三个点组成的线
SELECT SDO_GEOMETRY(
    2002,  -- 线类型
    8307,
    NULL,
    SDO_ELEM_INFO_ARRAY(1, 2, 1), -- 简单线
    SDO_ORDINATE_ARRAY(120,30, 121,31, 122,30) -- 三个点坐标
) FROM dual;
~~~

创建多边形

~~~oraclesqlplus
-- 创建四边形(必须闭合)
SELECT SDO_GEOMETRY(
    2003,  -- 多边形类型
    8307,
    NULL,
    SDO_ELEM_INFO_ARRAY(1, 1003, 1), -- 外多边形
    SDO_ORDINATE_ARRAY(120,30, 121,30, 121,31, 120,31, 120,30) -- 闭合坐标
) FROM dual;
~~~

### SDO_WITHIN_DISTANCE 函数详解

用于查询在指定距离范围内的空间对象。

基本语法

~~~oraclesqlplus
SDO_WITHIN_DISTANCE(
    geometry1  SDO_GEOMETRY,  -- 要检查的几何对象
    geometry2  SDO_GEOMETRY,  -- 参考几何对象
    params     VARCHAR2       -- 距离参数
) RETURN VARCHAR2;
~~~

参数说明

- `params` 格式：`'distance=<数值> unit=<单位>'`
	- `distance`：距离值
	- `unit`：单位(默认为坐标系单位，WGS84为米)

查询某点1公里范围内的所有商店

~~~oraclesqlplus
SELECT s.store_id, s.store_name
FROM stores s
WHERE SDO_WITHIN_DISTANCE(
    s.location,  -- 商店位置字段
    SDO_GEOMETRY(2001, 8307, SDO_POINT_TYPE(120.5, 30.2, NULL), NULL, NULL), -- 中心点
    'distance=1000'  -- 1公里范围内
) = 'TRUE';
~~~

查询某区域500米内的所有道路

~~~oraclesqlplus
SELECT r.road_id, r.road_name
FROM roads r, regions reg
WHERE reg.region_id = 101
AND SDO_WITHIN_DISTANCE(
    r.geom,      -- 道路几何
    reg.geom,    -- 区域几何
    'distance=500'  -- 500米内
) = 'TRUE';
~~~

### SDO_INSIDE

用于判断一个几何对象是否完全包含在另一个几何对象内部。

基本语法

~~~oraclesqlplus
SDO_INSIDE(
    geometry1  SDO_GEOMETRY,  -- 要检查的几何对象
    geometry2  SDO_GEOMETRY,  -- 容器几何对象
    tol        NUMBER         -- 容差
) RETURN VARCHAR2;
~~~

查询完全在某个区域内的所有建筑

~~~oraclesqlplus
SELECT b.building_id, b.building_name
FROM buildings b, city_zones z
WHERE z.zone_id = 5
AND SDO_INSIDE(
    b.geometry,  -- 建筑几何
    z.geometry,  -- 区域几何
    0.05         -- 容差
) = 'TRUE';
~~~

检查点是否在多边形内

~~~oraclesqlplus
SELECT 
    CASE 
        WHEN SDO_INSIDE(
            SDO_GEOMETRY(2001, 8307, SDO_POINT_TYPE(120.3, 30.5, NULL), NULL, NULL),
            polygon_geom,
            0.01
        ) = 'TRUE' THEN 'Inside'
        ELSE 'Outside'
    END AS position_status
FROM administrative_areas
WHERE area_id = 101;
~~~

