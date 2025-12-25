---
layout: post
title: Go 应用部署：UPX 压缩与 Docker Scratch 镜像
date: 2025-12-25 19:05:13
tags:
  - Go
  - CI/CD
  - Docker
  - UPX
categories:
  - 编程记录
---

## 前言：减小 Go 应用产物体积

Go 语言通过静态编译生成单一二进制文件，这一特性非常适合用于容器化部署。
但在默认构建和打包方式下，Go 应用的最终交付产物，二进制可执行文件或者镜像会比较大。

这里可以使用下面两种方式减小产物体积：

* **使用 UPX 压缩 Go 可执行文件，减少二进制体积**
* **使用 Docker scratch 镜像，去掉不必要的运行环境**

## 使用 UPX 压缩 Go 可执行文件

UPX（Ultimate Packer for eXecutables）是一个**通用的可执行文件压缩工具**。

UPX 的核心特点是：

* **在磁盘上以压缩形式存在**
* **程序启动时自动解压到内存中执行**
* 对程序逻辑完全透明，无需改代码

UPX 将原始可执行文件压缩，在文件头部插入一个极小的解压 stub，程序启动时，stub 将主体代码解压到内存，跳转到真正的入口点执行。
所以，它的磁盘占用会显著减少，但内存中仍是完整程序，仅在启动阶段会有一次性的解压开销。

对于 Go 应用，在使用 UPX 之前，应该尽量减小二进制产物体积（在每个阶段都考虑减小），推荐使用下面的参数进行编译：

~~~shell
CGO_ENABLED=0 \
go build \
  -trimpath \
  -ldflags "-s -w" \
  -o app
~~~

参数说明：

* `CGO_ENABLED=0`：禁用 CGO ，避免链接系统 libc（如 glibc / musl），生成完全静态的 Go 二进制。是使用 `scratch` 镜像的前提，避免运行时依赖系统动态库。
* `-trimpath`：从编译产物中移除本地源码的绝对路径。减小少量二进制体积，避免泄露本地目录结构。
* `-ldflags "-s -w"`：去除符号表和调试信息。
    * -s：去除符号表（symbol table），移除函数名、变量名等符号信息，显著减小二进制体积。
    * -w：去除 DWARF 调试信息，移除用于调试和栈回溯的 DWARF 数据，对运行逻辑无影响。

在此基础上，就可以使用 UPX 镜像压缩了。

**安装 UPX：`apt install upx-ucl`**

**UPX 使用：`upx --best --lzma app`**

参数说明：

* `--best` | 使用最高压缩等级
* `--lzma` | 使用 LZMA 算法，压缩率最高

使用 UPX 的代价是：增加 CI 环节的步骤、启动阶段一次性解压开销。

## 使用 Docker Scratch 构建最小运行镜像

`scratch` 是 Docker 提供的一个**空白基础镜像**：

* 没有操作系统
* 没有 shell
* 没有任何系统库
* 大小为 **0 字节**

~~~dockerfile
FROM scratch
COPY app /app
ENTRYPOINT ["/app"]
~~~

使用 scratch 的理念是：

> **只把“程序本身”放进镜像中**

非常适合 Go 这类构建产物为完全静态二进制、无动态链接和外部运行时依赖的语言和应用场景。

使用 scratch 镜像的代价：运行环境没有任何工具，非常不利于调试。

## 结语

附一张使用 UPX 和 Docker Scratch 镜像的体积对比
原镜像使用没有使用 UPX 压缩，使用 debian:stable-slim 作为运行时镜像
效果还是非常明显的：

![镜像的体积对比.png](https://cooooing.github.io/images/编程记录/Go应用部署：UPX压缩与DockerScratch镜像/镜像的体积对比.png)
