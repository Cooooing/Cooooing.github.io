---
layout: post
title: ArchLinux作为主力系统
date: 2025-11-30 18:14:07
categories:
  - 编程记录
tags:
  - Arch Linux
---

## 系统

之前就在虚拟机和笔记本上装过 ArchLinux，想尝试尝试 Linux 系统作为主力开发系统。
主要原因是 windows 的命令行很难用，即便是有了 powershell，也改变不了使用它的痛苦。
特别是之前做 CI/CD 写 Makefile、Dokcerfile 和 github workflow.yaml 。光是路径问题就花了很久。
替换的契机是前几天用 rdp 远程开发的时候，连接断开（第二次了）。等到回去一看，电脑没有任何反应，应该是死机了。不知道任何原因。
所以花了两三天，给电脑刷了 ArchLinux 系统。

之前有写过一篇安装过程，其实还是很繁琐的。
后来发现其实系统镜像内置了方便的工具 *[archinstall](https://wiki.archlinux.org/title/Archinstall)* ，只需要根据选项进行配置就可以了。
比我自己手动装的要好不少（一些配置方面

装完之后难免要去自己自定义美化一下，虽然默认的审美上比以前用过的 ubuntu 桌面之类的有些提升。
下面就是都装完之后，选个好看的壁纸：

![arch-desktop](https://cooooing.github.io/images/编程记录/ArchLinux作为主力系统/arch-desktop.png)

## 问题

### 输入法

使用这个系统目前还是有很多问题的，主要集中在 KDE 的 wayland 这个桌面和图形平台上。
最严重的莫过于输入法的问题了，纯英文情况下还可以，只要配置得当，不会有什么问题。但是中文就不太行了。

Jetbrains Idea 至今还不支持。详见：(Wayland: support input methods (text-input-unstable-v3))[https://youtrack.jetbrains.com/issue/JBR-5672/Wayland-support-input-methods-text-input-unstable-v3]
好消息是将在2025.3版本支持，坏消息是目前最新正式版本是2025.2.5。也是给我赶上了，明年就能用了（好耶！）

VSCode 我以为也不会有问题的，结果和 Idea 的表现一模一样。（用的微软官方提供的 [visual-studio-code-bin](https://aur.archlinux.org/packages/visual-studio-code-bin/) 版本
不过好消息是可以解决。

修改 `~/.config/code-flags.conf` 文件即可（文件默认不存在，需要创建），添加以下内容：
```
--enable-features=UseOzonePlatform
--ozone-platform-hint=wayland
--enable-wayland-ime
```

### 远程控制

另一个问题就是远程控制了，对于远程开发来说还是很重要的功能。
但很可惜，wayland 在这方面做的很不好，可能与他们的安全限制有关系，无法做到无人值守的状态。

目前只能是使用 ssh 了。对于桌面可能就无缘了。

不过对于 Idea 远程开发，使用了它们的 Jetbrains Gateway 的方案。不得不说，各种问题，光是安装就费了我很大的劲，不过好在安装完可以用，虽然体验没那么好。
Jetbrains 在远程开发和 AI 方面真的是没有跟上。

后续可能会尝试  VSCode 的远程开发，不过我用惯了 Jetbrains，是真不习惯 VSCode。

### 2025-12-07 后记

终于是受不了 Wayland 的各种问题了，决定回归初心。作为开发环境，需要的是稳定，默认的也许就是最好的，于是决定转向 Ubuntu。
选择的系统是 Linux Mint，在经过了一个晚上之后，就得到了：

![mint-desktop](https://cooooing.github.io/images/编程记录/ArchLinux作为主力系统/mint-desktop.png)

标题也许换成 《Linux 作为主力系统》 更合适。
