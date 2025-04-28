---
layout: post
title: Kubernetes本地环境搭建及应用部署
date: 2025-04-23 22:01:51
categories:
  - 学习笔记
tags:
  - Kubernetes
---

## 基础环境准备（可选）

### 虚拟机配置

基础环境这里选择 multipass 虚拟机。（但只是使用它创建虚拟机）
当然，如果有真实物理机，并且他们网络是直通的，那可以省去很多配置的麻烦。这里大部分关于虚拟机的配置应该都可以省略。
但很可惜，我并没有那么多机器或者云服务器。但好在我的电脑（windows11）内存有64G，足够我随意的折腾。

创建三台虚拟机（一主二从）

~~~shell
multipass launch --name=master --cpus=2 --m=4096MiB -d 20G 24.04
multipass launch --name=worker1 --cpus=2 --m=4096MiB -d 20G 24.04
multipass launch --name=worker2 --cpus=2 --m=4096MiB -d 20G 24.04
~~~

### 基础网络配置（固定ip配置）

这里我需要为每台虚拟机都设置一个固定ip，防止机器重启后ip会发生变化，导致需要频繁改一些配置。**Multipass 默认通过 NAT 网络 + DHCP 动态分配 IP**
将宿主机ip固定为192.168.1.5
master 节点的ip为 192.168.1.10
worker1 节点的ip为 192.168.1.11
worker2 节点的ip为 192.168.1.12

这里以 master 节点为例，展示配置过程。

首先打开**Hyper-V 管理器**，右侧**虚拟交换机管理器**，新建虚拟交换机。如下图：
![新建虚拟交换机.png](https://cooooing.github.io/images/Kubernetes本地环境搭建及应用部署/新建虚拟交换机.png)

保存之后，来到**网络适配器**，为刚创建的虚拟交换机设置一个固定的ip。
![网络适配器.png](https://cooooing.github.io/images/Kubernetes本地环境搭建及应用部署/网络适配器.png)

修改`/etc/netplan/50-cloud-init.yaml`：

~~~yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: no
      addresses: [ 192.168.1.10/24 ]
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses: [ 192.168.1.1 ]
~~~

应用更改并验证

~~~shell
# 应用更改
sudo netplan apply
# 应用更改
sudo netplan --debug apply
# 检查 IP 是否生效
ip a show eth0
# 测试网络连通性
ping 192.168.1.1
~~~

输出如下：

~~~shell
ubuntu@master:/etc/netplan$ ip a show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 52:54:00:29:3e:e9 brd ff:ff:ff:ff:ff:ff
    inet 192.168.1.10/24 brd 192.168.1.255 scope global eth0
       valid_lft forever preferred_lft forever
    inet6 2409:8a20:2a0:6c60:5054:ff:fe29:3ee9/64 scope global dynamic mngtmpaddr noprefixroute
       valid_lft 198387sec preferred_lft 111987sec
    inet6 fe80::5054:ff:fe29:3ee9/64 scope link
       valid_lft forever preferred_lft forever
ubuntu@master:/etc/netplan$ ping 192.168.1.1
PING 192.168.1.1 (192.168.1.1) 56(84) bytes of data.
64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=7.33 ms
64 bytes from 192.168.1.1: icmp_seq=2 ttl=64 time=3.45 ms
64 bytes from 192.168.1.1: icmp_seq=3 ttl=64 time=3.77 ms
64 bytes from 192.168.1.1: icmp_seq=4 ttl=64 time=4.16 ms
^C
--- 192.168.1.1 ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, time 3006ms
rtt min/avg/max/mdev = 3.449/4.675/7.326/1.550 ms
~~~

### 配置域名

在三台虚拟机的 `/etc/hosts` 文件末尾添加：

~~~
192.168.1.10 master
192.168.1.11 worker1
192.168.1.12 worker2
~~~

### 配置ssh登录

这里配置ssh密码登录，以方便外部宿主机连接使用。（因为修改为固定ip后，multipass将无法连接到虚拟机）

设置密码：

~~~shell
sudo passwd ubuntu
~~~

修改`/etc/ssh/sshd_config`配置中的以下内容：

~~~
# 是否允许使用密码登录 SSH
PasswordAuthentication yes
# 是否允许使用公钥认证登录 SSH
PubkeyAuthentication yes
# 是否启用 PAM（Pluggable Authentication Modules，可插拔认证模块）
UsePAM no
~~~

> 注意：是否包含`Include /etc/ssh/sshd_config.d/*.conf`配置
> 它支持包含其他配置文件，从而实现配置的模块化和可维护性。**所有配置会合并，顺序按文件名排序加载，后加载的内容会覆盖前面的设置。**

重启 ssh 服务应用更改后，就可以在宿主机使用配好的固定ip进行ssh登录了：

~~~shell
sudo systemctl restart ssh
~~~

### 配置全局代理

Linux中，设置全系统代理（包括 GUI 图形界面 + CLI），需要修改`/etc/environment`文件；仅为 shell 用户（终端）设置代理，需要修改`/etc/profile`文件；为单用户设置代理，需要修改`~/.bashrc`文件。

`/etc/environment`文件添加：

~~~
http_proxy="http://192.168.1.5:7890"
https_proxy="http://192.168.1.5:7890"
all_proxy="socks5://192.168.1.5:7890"
no_proxy="localhost,127.0.0.1,::1"
~~~

重启应用更改。

`/etc/profile`或者`~/.bashrc`文件添加：

~~~
export http_proxy=http://172.25.240.1:7890
export https_proxy=http://172.25.240.1:7890
export all_proxy=socks5://172.25.240.1:7890
export no_proxy="localhost,127.0.0.1,::1"
~~~

`source /etc/profile`或者`source ~/.bashrc`应用更改。

**取消代理：`unset http_proxy https_proxy all_proxy`**

验证代理是否生效，可以使用`curl -v https://www.google.com`
会返回包含类似`Connected to 192.168.1.5 (192.168.1.5) port 7890`的内容，如下（上述命令返回过长，这里以本地服务为例）：

~~~
ubuntu@master:~$ curl -v http://192.168.1.5:8000/api/user/v1/helloworld/ubuntu
* Uses proxy env variable no_proxy == 'localhost,127.0.0.1,::1'
* Uses proxy env variable http_proxy == 'http://192.168.1.5:7890'
*   Trying 192.168.1.5:7890...
* Connected to 192.168.1.5 (192.168.1.5) port 7890
> GET http://192.168.1.5:8000/api/user/v1/helloworld/ubuntu HTTP/1.1
> Host: 192.168.1.5:8000
> User-Agent: curl/8.5.0
> Accept: */*
> Proxy-Connection: Keep-Alive
>
< HTTP/1.1 200 OK
< Content-Length: 26
< Connection: keep-alive
< Content-Type: application/json
< Date: Wed, 23 Apr 2025 15:34:03 GMT
< Keep-Alive: timeout=4
< Proxy-Connection: keep-alive
<
* Connection #0 to host 192.168.1.5 left intact
{"message":"Hello ubuntu"}
~~~

## kubernetes 环境搭建

### 部署 Server

这里使用 [K3s - 轻量级 Kubernetes](https://docs.k3s.io/zh/) 部署。
与 Kubernetes 不同，这里的 Master 节点叫 Server 节点，而 Slave 节点叫 Agent 节点。

部署 Server 节点 `curl -sfL https://get.k3s.io | sh -`

~~~shell
ubuntu@master:~$ curl -sfL https://get.k3s.io | sh -
[INFO]  Finding release for channel stable
[INFO]  Using v1.32.3+k3s1 as release
[INFO]  Downloading hash https://github.com/k3s-io/k3s/releases/download/v1.32.3+k3s1/sha256sum-amd64.txt
[INFO]  Downloading binary https://github.com/k3s-io/k3s/releases/download/v1.32.3+k3s1/k3s
[INFO]  Verifying binary download
[INFO]  Installing k3s to /usr/local/bin/k3s
[INFO]  Skipping installation of SELinux RPM
[INFO]  Creating /usr/local/bin/kubectl symlink to k3s
[INFO]  Creating /usr/local/bin/crictl symlink to k3s
[INFO]  Creating /usr/local/bin/ctr symlink to k3s
[INFO]  Creating killall script /usr/local/bin/k3s-killall.sh
[INFO]  Creating uninstall script /usr/local/bin/k3s-uninstall.sh
[INFO]  env: Creating environment file /etc/systemd/system/k3s.service.env
[INFO]  systemd: Creating service file /etc/systemd/system/k3s.service
[INFO]  systemd: Enabling k3s unit
Created symlink /etc/systemd/system/multi-user.target.wants/k3s.service → /etc/systemd/system/k3s.service.
[INFO]  systemd: Starting k3s
~~~

查看节点运行状态`kubectl get node`：

~~~shell
ubuntu@master:~$ sudo kubectl get node
NAME     STATUS   ROLES                  AGE   VERSION
master   Ready    control-plane,master   78s   v1.32.3+k3s1
~~~

获取 node-token `cat /var/lib/rancher/k3s/server/node-token` 在部署 Agent 节点的时候需要用到：

~~~shell
ubuntu@master:~$ sudo cat /var/lib/rancher/k3s/server/node-token
K104869223bb6e5c3c1bb95bc7dcc505cb2d5576cf2253e9bd0df1b3a7852f91397::server:368a64fba85ad0718fe841967df1717f
~~~

### 部署 Agent

部署 Agent 节点 `curl -sfL https://get.k3s.io | K3S_URL=https://server:6443 K3S_TOKEN=token sh -`

~~~shell
ubuntu@worker1:~$ curl -sfL https://get.k3s.io | K3S_URL=https://master:6443 K3S_TOKEN=K104869223bb6e5c3c1bb95bc7dcc505cb2d5576cf2253e9bd0df1b3a7852f91397::server:368a64fba85ad0718fe841967df1717f sh -
[INFO]  Finding release for channel stable
[INFO]  Using v1.32.3+k3s1 as release
[INFO]  Downloading hash https://github.com/k3s-io/k3s/releases/download/v1.32.3+k3s1/sha256sum-amd64.txt
[INFO]  Downloading binary https://github.com/k3s-io/k3s/releases/download/v1.32.3+k3s1/k3s
[INFO]  Verifying binary download
[INFO]  Installing k3s to /usr/local/bin/k3s
[INFO]  Skipping installation of SELinux RPM
[INFO]  Creating /usr/local/bin/kubectl symlink to k3s
[INFO]  Creating /usr/local/bin/crictl symlink to k3s
[INFO]  Creating /usr/local/bin/ctr symlink to k3s
[INFO]  Creating killall script /usr/local/bin/k3s-killall.sh
[INFO]  Creating uninstall script /usr/local/bin/k3s-agent-uninstall.sh
[INFO]  env: Creating environment file /etc/systemd/system/k3s-agent.service.env
[INFO]  systemd: Creating service file /etc/systemd/system/k3s-agent.service
[INFO]  systemd: Enabling k3s-agent unit
Created symlink /etc/systemd/system/multi-user.target.wants/k3s-agent.service → /etc/systemd/system/k3s-agent.service.
[INFO]  systemd: Starting k3s-agent
~~~

节点都部署完后，节点状态如下：

~~~shell
ubuntu@master:~$ sudo kubectl get node
NAME      STATUS   ROLES                  AGE   VERSION
master    Ready    control-plane,master   18m   v1.32.3+k3s1
worker1   Ready    <none>                 29s   v1.32.3+k3s1
worker2   Ready    <none>                 5s    v1.32.3+k3s1
~~~

设置 K3S_URL 参数会使 K3s 以 worker 模式运行。 K3s agent 会在所提供的 URL 上向监听的 K3s 服务器注册。

到这里，Kubernetes 环境搭建完成。

## 创建 Deployment

创建`nginx-deployment.yaml`：

~~~yaml
# 定义 Deployment 基本信息
metadata.name: 给这个 Deployment 起个名字。
apiVersion: apps/v1 # Deployment 所使用的 API 版本，K8s 1.9+ 都是 apps/v1。
kind: Deployment # 资源类型是 Deployment。
metadata:
  name: nginx # Deployment 的名字。
# 定义副本数量和 Pod 选择器
spec:
  replicas: 2 # 创建副本数量
  selector:
    matchLabels:
      app: nginx # Deployment 会管理所有 带有标签 app=nginx 的 Pod。它必须和后面的模板里的 labels 保持一致。
  # 定义 Pod 模板（template）
  template:
    metadata:
      labels:
        app: nginx # 为 Pod 打上 app=nginx 标签，方便 selector 识别。
    # 定义容器信息
    spec:
      containers:
        - name: nginx # 容器名称
          image: nginx:latest # 镜像名称
          ports:
            - containerPort: 80 # 容器端口
~~~

使用 `kubectl apply` 命令创建 Deployment：

~~~shell
ubuntu@master:~/apps$ sudo kubectl apply -f nginx-deployment.yaml
deployment.apps/nginx created
~~~

使用`kubectl get deployment`查看运行状态，使用`kubectl get pods`查看 Pod 状态：

~~~shell
ubuntu@master:~/apps$ sudo kubectl get deployment
NAME    READY   UP-TO-DATE   AVAILABLE   AGE
nginx   2/2     2            2           17s
ubuntu@master:~/apps$ sudo kubectl get pods -l app=nginx
NAME                   READY   STATUS    RESTARTS   AGE
nginx-96b9d695-gfjvq   1/1     Running   0          25s
nginx-96b9d695-w5qxx   1/1     Running   0          25s
~~~

可以看到 Deployment 创建 Pod 的命名规则：`${DeploymentName}-${DeploymentUid}-${Hash}`。

使用 `kubectl get pod -o wide` 查看 Pod 运行状态和 IP 地址，可以看到 nginx 被创建了两个 Pod 副本，分别部署在了 worker1 和 worker2 上面：

~~~shell
ubuntu@master:~/apps$ sudo kubectl get pod -o wide
NAME                   READY   STATUS    RESTARTS   AGE     IP          NODE      NOMINATED NODE   READINESS GATES
nginx-96b9d695-gfjvq   1/1     Running   0          8m42s   10.42.2.3   worker2   <none>           <none>
nginx-96b9d695-w5qxx   1/1     Running   0          8m42s   10.42.1.3   worker1   <none>           <none>
~~~

此时的 nginx 还不能被外部访问，他们的 IP 是 Cluster 的内部私有 IP，只能在集群内部访问。
**并且这些 IP 是浮动的，Pod 重启后，IP 也会变化。**
这时就需要创建 Service 来解决这个问题。

## 创建 Service

Service 是 Kubernetes 中一种网络抽象，用于为一组 Pod 提供统一访问入口。
简单来说，Pod 是会变化的（比如被删除、替换），而 Service 提供一个 固定 IP / 名称 / 端口，始终指向一组后端 Pod。

~~~shell
apiVersion: v1 # 使用 v1 API，Service 资源的标准版本
kind: Service # 声明该资源类型为 Service
metadata:
  name: nginx-service # Service 的名字，供集群中引用、DNS 名称生成等使用
spec:
  type: NodePort  # 设置 Service 类型为 NodePort，支持通过任意节点的 IP + nodePort 端口访问服务
  selector:
    app: nginx    # 选择所有标签为 app=nginx 的 Pod
  ports:
    - port: 80         # Service 自己监听的端口，供集群内其他 Pod 调用这个服务时使用
      targetPort: 80   # 转发到后端 Pod 的哪个端口（nginx 监听的端口）
      nodePort: 30080  # 外部访问时的端口（可不写，系统会自动分配 30000~32767）
~~~

使用 `kubectl apply` 命令创建 Service，使用 `kubectl get service` 查看运行状态：

~~~shell
ubuntu@master:~/apps/nginx$ sudo kubectl apply -f nginx-service.yaml
service/nginx-service created
ubuntu@master:~/apps/nginx$ sudo kubectl get service
NAME            TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
kubernetes      ClusterIP   10.43.0.1       <none>        443/TCP        72m
nginx-service   NodePort    10.43.119.114   <none>        80:30080/TCP   2m57s
~~~

到这里，已经可以使用节点 node 外部的 IP + nodePort 访问到 nginx 了。
但是，访问 nginx 的时候，IP 是 node 的 IP，没有一个统一的入口。

## 配置应用打包流程

经过上面 nginx 部署的测试，现在k8s集群已经是可用状态了。下面要将本地编写的应用打包为镜像，并上传到镜像仓库，再通过 yaml 配置部署到 k8s 集群中。

这里使用的本地项目使用 go-kratos 构建的微服务项目。
这是一个大仓项目，目录结构如下：

~~~
BBS
├── .github
├── app
│   ├── backend
│   │   ├── common
│   │   │   ├── api
│   │   │   │   ├── common
│   │   │   │   │   ├── v1
│   │   │   │   │   │   ├── error_reason.pb.go
│   │   │   │   │   │   └── error_reason.proto
│   │   │   │   ├── user
│   │   │   │   │   ├── v1
│   │   │   │   │   │   ├── demo.pb.go
│   │   │   │   │   │   ├── demo.proto
│   │   │   │   │   │   ├── demo_grpc.pb.go
│   │   │   │   │   │   └── demo_http.pb.go
│   │   │   ├── third_party
│   │   ├── user
│   │   │   ├── cmd
│   │   │   │   ├── user
│   │   │   │   │   ├── main.go
│   │   │   │   │   ├── wire.go
│   │   │   │   │   └── wire_gen.go
│   │   │   ├── configs
│   │   │   │   ├── config.yaml
│   │   │   ├── internal
│   │   │   ├── Dockerfile
│   │   │   ├── Makefile
│   │   ├── go.mod
│   │   ├── go.sum
│   │   ├── openapi.yaml
│   ├── frontend
└── ...
~~~

基于这个目录结构，来修改 应用构建文件`Makefile`、Docker镜像构建文件`Dockerfile`、github action 文件`user-build.yaml`。

首先是 `Makefile` 文件：
~~~makefile
# 全局变量定义
GOHOSTOS := $(shell go env GOHOSTOS)
GOPATH := $(shell go env GOPATH)
VERSION := latest

# 项目目录结构定义 - 使用更可靠的路径获取方式
ROOT_DIR := $(realpath $(dir $(lastword $(MAKEFILE_LIST)))/..)
COMMON_DIR := $(ROOT_DIR)/common
USER_DIR := $(ROOT_DIR)/user
API_DIR := $(COMMON_DIR)/api
THIRD_PARTY_DIR := $(COMMON_DIR)/third_party
INTERNAL_DIR := $(ROOT_DIR)/user/internal

# 根据操作系统设置查找命令
ifeq ($(GOHOSTOS), windows)
    Git_Bash := $(subst \,/,$(subst cmd\,bin\bash.exe,$(dir $(shell where git))))
    FIND_CMD := $(Git_Bash) -c "find"
else
    FIND_CMD := find
endif

# Proto 文件查找
INTERNAL_PROTO_FILES := $(shell $(FIND_CMD) $(INTERNAL_DIR) -name '*.proto' 2>/dev/null)
API_PROTO_FILES := $(shell $(FIND_CMD) $(API_DIR) -name '*.proto' 2>/dev/null)

## 工具安装
.PHONY: init
init:
	@echo "Installing required tools..."
	go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
	go install github.com/go-kratos/kratos/cmd/kratos/v2@latest
	go install github.com/go-kratos/kratos/cmd/protoc-gen-go-http/v2@latest
	go install github.com/google/gnostic/cmd/protoc-gen-openapi@latest
	go install github.com/google/wire/cmd/wire@latest

## 内部 Proto 生成
.PHONY: config
config:
	@echo "Generating internal protobuf files..."
	@test -n "$(INTERNAL_PROTO_FILES)" || (echo "No proto files found in $(INTERNAL_DIR)" && exit 1)
	protoc --proto_path=$(INTERNAL_DIR) \
	       --proto_path=$(THIRD_PARTY_DIR) \
	       --go_out=paths=source_relative:$(INTERNAL_DIR) \
	       $(INTERNAL_PROTO_FILES)

## API Proto 生成
.PHONY: api
api:
	@echo "Generating API protobuf files..."
	@test -n "$(API_PROTO_FILES)" || (echo "No proto files found in $(API_DIR)" && exit 1)
	protoc --proto_path=$(API_DIR) \
	       --proto_path=$(THIRD_PARTY_DIR) \
	       --go_out=paths=source_relative:$(API_DIR) \
	       --go-http_out=paths=source_relative:$(API_DIR) \
	       --go-grpc_out=paths=source_relative:$(API_DIR) \
	       --openapi_out=fq_schema_naming=true,default_response=false:$(API_DIR) \
	       $(API_PROTO_FILES)

## 构建应用
.PHONY: build
build:
	@echo "Building application..."
	@mkdir -p $(ROOT_DIR)/bin/
	@cd $(USER_DIR) && \
	go build -ldflags "-X main.Version=$(VERSION)" -o $(ROOT_DIR)/bin/server ./cmd/user/...
	@echo "Output binary: $(ROOT_DIR)/bin/server"

## 代码生成
.PHONY: generate
generate:
	@echo "Generating code..."
	@cd $(USER_DIR) && \
	go generate ./... && \
	go mod tidy

## 执行全部任务
.PHONY: all
all: init api config build generate
~~~

这里的 VERSION 暂时选择写死了，正常会通过 `VERSION := $(shell git describe --tags --always)` git 命令来获取最新的标签（tag）或提交哈希（commit hash）。

然后是 DockerFile 文件：
~~~dockerfile
# 第一阶段：构建Go应用
FROM golang:1.23 as builder

WORKDIR /build

# 复制 go.mod 和 go.sum，提前拉依赖
COPY go.mod go.sum ./
RUN go mod download

# 复制 user 和 common 源码
COPY user/ ./user/
COPY common/ ./common/

# 进入 user 目录进行构建
WORKDIR /build/user

# 编译
RUN make init && make generate && make build

# 第二阶段：制作小体积运行环境
FROM debian:stable-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates netbase && \
    rm -rf /var/lib/apt/lists/*

# 把可执行文件拷贝进来
COPY --from=builder /build/bin/ /app/
COPY --from=builder /build/user/configs/ /app/configs/

WORKDIR /app

EXPOSE 8000 9000

CMD ["/app/server", "-conf", "/app/configs/config.yaml"]
~~~

最后是 github action 文件：
~~~yaml
name: Docker Build and Push for Go User App

on:
  workflow_dispatch:

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    steps:
      # Step 1: Checkout the code
      - name: Checkout Code
        uses: actions/checkout@v4

      # Step 2: Set up Go environment + cache
      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.23'

      - name: Cache Go Modules
        uses: actions/cache@v4
        with:
          path: |
            ~/.cache/go-build
            ~/go/pkg/mod
          key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
          restore-keys: |
            ${{ runner.os }}-go-

      # Step 3: Install protoc
      - name: Install Protobuf Compiler
        run: |
          sudo apt-get update
          sudo apt-get install -y protobuf-compiler
          protoc --version

      # Step 4: Docker Login
      - name: Docker Login
        uses: docker/login-action@v3
        with:
          registry: registry.cn-hangzhou.aliyuncs.com
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      # Step 5: Build and Push Docker Image
      - name: Build and Push Docker Image
        uses: docker/build-push-action@v5
        with:
          context: app/backend
          file: app/backend/user/Dockerfile
          push: true
          tags: |
            registry.cn-hangzhou.aliyuncs.com/docker-learn-cooooing/user:latest
~~~

其中 secrets.DOCKER_USERNAME 和 secrets.DOCKER_PASSWORD 是 GitHub Secrets，需要在项目设置中配置，用于登录阿里的镜像仓库。
目前配置的是手动触发，后续可修改为 push 或者 release 时触发。自动构建最新的镜像推送到阿里的镜像仓库。

最后回到 kubernetes ，通过 yaml 文件创建 deployment：
~~~yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
  labels:
    app: user-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      imagePullSecrets:
        - name: aliyun-registry-secret
      containers:
        - name: user
          image: registry.cn-hangzhou.aliyuncs.com/docker-learn-cooooing/user:latest
          ports:
            - containerPort: 8000
            - containerPort: 9000
          volumeMounts:
            - name: config-volume
              mountPath: /data/conf
          resources:
            limits:
              cpu: "500m"
              memory: "512Mi"
            requests:
              cpu: "100m"
              memory: "128Mi"
#          readinessProbe: # 就绪探针，确保容器准备好才流量转发
#            httpGet:
#              path: /healthz
#              port: 8000
#            initialDelaySeconds: 5
#            periodSeconds: 10
#          livenessProbe: # 存活探针，崩了自动重启
#            httpGet:
#              path: /healthz
#              port: 8000
#            initialDelaySeconds: 15
#            periodSeconds: 20
      volumes:
        - name: config-volume
          emptyDir: { } # 这里可以替换成挂载 ConfigMap

---
apiVersion: v1
kind: Service
metadata:
  name: user-service
spec:
  selector:
    app: user-service
  ports:
    - name: http
      port: 8000
      targetPort: 8000
    - name: grpc
      port: 9000
      targetPort: 9000
  type: ClusterIP
~~~

它会从阿里镜像仓库拉取镜像，并创建 pod 和 service。
其中关于探针的部分被注释掉了，**探针（Probes）是一种用于检测容器健康状况的机制。探针允许Kubernetes定期检查容器是否仍在运行并且按预期工作。根据探针的检查结果，Kubernetes可以决定是否需要重启容器或者进行其他操作。**
探针需要服务实现一个HTTP端点，Kubernetes 将定期对这个端点发送GET请求。如果端点返回一个成功的状态码（通常是200-399范围内），Kubernetes就会认为容器是健康的。

这里 service 并没有配置 NodePort，所以目前服务只暴露在 Kubernetes 集群内部，外部访问需要通过 ingress 配置。

## 配置 Helm

Helm 是 Kubernetes 的包管理器。安装过程参考[Helm 文档](https://helm.sh/zh/docs/)，这里省略。

Helm 默认会访问 localhost 的 8080 端口，但是这里使用 k3s，默认的 API Server 地址和端口通常是`https://<K3S_SERVER_IP>:6443`，所以访问 localhost 的 8080 端口会报错：
`Error: INSTALLATION FAILED: Kubernetes cluster unreachable: Get "http://localhost:8080/version": dial tcp [::1]:8080: connect: connection refused`
所以需要一些设置：

Helm 默认会读取 `~/.kube/config` 文件，但 **K3s 的 `kubeconfig` 默认存储在 `/etc/rancher/k3s/k3s.yaml`**，需要复制到本地并设置权限：

~~~bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER ~/.kube/config
~~~

使用 `helm ls --all-namespaces` 测试 Helm 是否能访问 K3s：

~~~shell
ubuntu@master:~$ helm ls --all-namespaces
NAME            NAMESPACE       REVISION        UPDATED                                 STATUS          CHART                           APP VERSION
traefik         kube-system     1               2025-04-25 08:22:17.95057216 +0000 UTC  deployed        traefik-34.2.1+up34.2.0         v3.3.2     
traefik-crd     kube-system     1               2025-04-25 08:22:02.482297704 +0000 UTC deployed        traefik-crd-34.2.1+up34.2.0     v3.3.2     
~~~

## 创建 Ingress

使用 Kubernetes 的 Ingress 来创建一个统一的负载均衡器，从而实现当用户访问不同的域名时，访问后端不同的服务。
**Ingress 的功能其实很容易理解：所谓 Ingress 就是 Service 的“Service”，这就是它们两者的关系。**

在 Kubernetes（K8s）中，Ingress Controller 默认是 Traefik，它为云原生和动态环境设计，可以监听k8s的资源变化。
但这里还是使用 Nginx 作为流量入口管理器，虽然它比较偏静态。

首先卸载默认的 Traefik：

~~~shell
helm uninstall traefik -n kube-system
helm uninstall traefik-crd -n kube-system
~~~

然后使用 Helm 安装 Nginx：

~~~shell
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install nginx-ingress ingress-nginx/ingress-nginx -n kube-system
~~~

或者使用 kubectl 安装：

~~~shell
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.1/deploy/static/provider/baremetal/deploy.yaml
~~~

使用以下`ingress.yaml`创建 Ingress 资源：

~~~shell
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2 # 路径重写，去掉 /user
    nginx.ingress.kubernetes.io/upstream-hash-by: "$remote_addr" # 负载均衡
spec:
  rules:
    - host: ""  # 留空，表示使用 IP 地址
      http:
        paths:
          - path: /user(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: user-service  # 目标服务名
                port:
                  number: 8000  # user-service 服务的 HTTP 端口
~~~

使用 `kubectl apply -f ingress.yaml` 创建 Ingress 资源后，就可以通过 `http://master/user` 访问到后端服务了。

到这里基本应用的部署就完成了。
