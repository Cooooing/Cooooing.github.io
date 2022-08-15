---
title: APlayer和MetingJS的使用
date: 2022-08-15 15:25:36
tags:
- APlayer
- MetingJS
categories:
- 学习记录
---

## 简介

APlayer是一个可爱的HTML5音乐播放器。
MetingJS给APlayer播放器加入网易云等支持。

[APlayer项目地址](https://github.com/DIYgod/APlayer)
[MetingJS项目地址](https://github.com/metowolf/MetingJS)
[APlayer官方文档](https://aplayer.js.org/#/home)

## 配置

使用cdn调用
在 <head> 里面插入：
~~~javascript
<link href="https://cdn.bootcss.com/aplayer/1.10.1/APlayer.min.css" rel="stylesheet">
<script src="https://cdn.bootcss.com/aplayer/1.10.1/APlayer.min.js"></script>
~~~
在 footer 里面插入：
~~~javascript
<script src="https://cdn.jsdelivr.net/npm/meting@2.0.1/dist/Meting.min.js"></script>
~~~
当然，也可以将原文件下载至本地进行调用。

## 使用

### Aplayer原生用法

例如：
<div id="aplayer_1"></div>
<script type="text/javascript">
    const ap = new APlayer({
        container: document.getElementById('aplayer_1'),
        audio: [{
            name: '长岛',
            artist: '花粥',
            url: '../../images/APlayer和MetingJS的使用/长岛.mp3',
            cover: '../../images/APlayer和MetingJS的使用/长岛封面.png'
        }]
    });
</script>

使用音乐播放器加载音乐，url可以是本地资源也可以是http链接。
代码：
~~~html
<div id="aplayer_1"></div>
<script type="text/javascript">
    const ap = new APlayer({
        container: document.getElementById('aplayer_1'),
        audio: [{
            name: '长岛',
            artist: '花粥',
            url: '../../images/APlayer和MetingJS的使用/长岛.mp3',
            cover: '../../images/APlayer和MetingJS的使用/长岛封面.png'
        }]
    });
</script>
~~~

> 更多的用法，比如多个音乐组成的列表模式、节省空间的迷你模式等可以参考[APlayer官方文档](https://aplayer.js.org/#/home)

### 使用MetingJs载入网易云等其他音乐网站的音乐

例如：
<meting-js
    server="netease"
    type="song"
    id="536622304">
</meting-js>

代码：
~~~html
<meting-js
    server="netease"
    type="song"
    id="536622304">
</meting-js>
~~~

可以看出MetingJS的代码也更简洁。
有三个必要参数：
1. `id` 指定歌曲 ID / 播放列表 ID / 专辑 ID / 搜索关键字
2. `server` 指定音乐平台： netease tencent kugou xiami baidu
3. `type` 指定调用类型：song playlist album search artist
> 还有许多其他的参数可以参看[MetingJS官方文档](https://github.com/metowolf/MetingJS#option)

播放列表（`type="playlist"`）：
<meting-js
    server="netease"
    type="playlist"
    id="7345595717">
</meting-js>

固定播放器（`fixed="true"`），像页面左下角那个一样
迷你播放器（`mini="true"`）：
<meting-js
    server="netease"
    type="song"
    id="536622304"
    mini="true">
</meting-js>

更多的参数就不介绍了。

## 总结

之前使用butterfly主题时，主题内置了MetingJS。只需要在配置中改几个配置项，加一个div便可实现全盘吸底的APlayer。
但是本文的方法是通用的，在主题中使用的话，需要找header、footer等文件，在其中修改。
~~啊，我怎么又在改博客。~~