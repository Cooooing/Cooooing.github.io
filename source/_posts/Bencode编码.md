---
layout: post
title: Bencode编码
date: 2024-10-12 10:46:02
tags:
  - java
  - Bencode编码
  - BitTorrent
  - p2p
categories:
  - 学习笔记
---

## Bencode

Bencode（发音为Bee-Encode）是 BitTorrent 用在传输数据结构的编码方式。

这种编码方式支持四种资料类型：

* 字符串
* 整数
* 串列
* 字典表

Bencode 最常被用在 .torrent 档中，文件里的元数据都是被 Bencode 编码过的字典表。这种编码方法也被 Tracker 返回响应时使用。

虽然比用纯二进制编码效率低，但 Bencode 结构简单而且不受字节存储顺序影响（所有数字以十进制编码），这对于跨平台性非常重要。并且，Bencode
具有较好的灵活性，即使存在故障的字典键，只要将其忽略并更换新的就能兼容补充。

## 编码方法

Bencode 使用 ASCII 字符进行编码。

Bencode（BitTorrent 编码）是一种简单且轻量级的序列化格式，主要用于 BitTorrent 协议中的元数据文件（`.torrent` 文件）。Bencode
支持四种基本类型：整数、字符串、列表和字典。下面是 Bencode 的详细介绍，包括其语法、数据类型和一些示例。

1. 整数
    - 语法：`i<数字>e` **int 整数 end**
    - 示例：`i123e` 表示整数 123
    - > 负数和零也是有效的，例如 `i-123e` 表示 -123，`i0e` 表示 0，但是不可以使用 `i-0e` 包括其他除了`i0e`的具有前导0的（`i03e`）都是无效的。
2. 字符串
    - 语法：`<长度>:<字符串>`
    - 示例：`4:spam` 表示字符串 "spam"
    - > 长度是指字符串的**字节数**，而不是字符数
3. 列表
    - 语法：`l<元素1><元素2>...e` **list 列表 end**
    - 示例：`l4:spam3:fooi42ee` 表示列表 `["spam", "foo", 42]`
    - > 列表中的元素可以是任何 Bencode 支持的类型
4. 字典
    - 语法：`d<键1><值1><键2><值2>...e` **dictionary 字典 end**
    - 示例：`d3:bar4:spam3:fooi42ee` 表示字典 `{"bar": "spam", "foo": 42}`
    - > **字典中的键必须是字符串**，并且按键的字典序排序

复杂结构的 Bencode 示例：
包含嵌套结构的 Bencode

```bencode
d8:announce22:https://tracker.example.com/announce4:infod6:lengthi1000e4:name4:file15:piece lengthi262144e6:pieces20:0123456789abcdef0123456789abcdefe
```

表示一个包含嵌套字典和列表的复杂结构，类似于以下 JSON：

```json
{
  "announce": "https://tracker.example.com/announce",
  "info": {
    "length": 1000,
    "name": "file",
    "piece length": 262144,
    "pieces": "0123456789abcdef0123456789abcdef"
  }
}
```

## Bencode 编解码实现

~~~java
package com.example.kernel.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class BencodeUtils {

    // 编码方法
    public static String encode(Object obj) {
        StringBuilder sb = new StringBuilder();
        if (obj == null) {
            return "";
        }
        switch (obj) {
            case Map<?, ?> map -> {
                sb.append("d");
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    sb.append(encode(entry.getKey()));
                    sb.append(encode(entry.getValue()));
                }
                sb.append("e");
            }
            case Integer ignored -> sb.append("i").append(obj).append("e");
            case List<?> list -> {
                sb.append("l");
                for (Object item : list) {
                    sb.append(encode(item));
                }
                sb.append("e");
            }
            case String str -> sb.append(str.length()).append(':').append(str);
            case null, default -> throw new IllegalArgumentException("Unsupported type: " + obj.getClass());
        }
        return sb.toString();
    }

    // 解码方法
    public static Object decode(byte[] s) {
        Object o = null;
        if (s == null || s.length == 0) {
            return o;
        }
        o = decodeObject(s, 0)[0];
        return o;
    }

    // 辅助方法：解码对象
    private static Object[] decodeObject(byte[] s, int index) {
        byte b = s[index];
        if (b == 'i') {
            // 整数类型
            index++;
            int start = index;
            while (s[index] != 'e') {
                index++;
            }
            long value = Long.parseLong(new String(s, start, index - start));
            index++;
            return new Object[]{value, index};
        } else if ('0' <= b && b <= '9') {
            // 字符串类型
            int start = index;
            while (s[index] != ':') {
                index++;
            }
            int length = Integer.parseInt(new String(s, start, index - start));
            index++;
            String str = new String(s, index, length);
            index += length;
            return new Object[]{str, index};
        } else if (b == 'd') {
            // 字典类型
            index++;
            Map<String, Object> map = new LinkedHashMap<>();
            while (s[index] != 'e') {
                Object[] keyResult = decodeObject(s, index);
                String key = (String) keyResult[0];
                index = (int) keyResult[1];
                Object[] valueResult = decodeObject(s, index);
                Object value = valueResult[0];
                index = (int) valueResult[1];
                map.put(key, value);
            }
            index++;
            return new Object[]{map, index};
        } else if (b == 'l') {
            // 列表类型
            index++;
            List<Object> list = new ArrayList<>();
            while (s[index] != 'e') {
                Object[] result = decodeObject(s, index);
                list.add(result[0]);
                index = (int) result[1];
            }
            index++;
            return new Object[]{list, index};
        } else {
            // 忽略无效的字符
            index++;
            return decodeObject(s, index);
        }
    }
}
~~~

