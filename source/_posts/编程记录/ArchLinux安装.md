---
layout: post
title: ArchLinux安装
date: 2025-09-21 22:38:38
categories:
  - 编程记录
tags:
  - Arch Linux
---

## 前言

Ubuntu、Deepin之类的玩腻了，尝试下新鲜玩意。
最开始在旧电脑上尝试直接安装，但是失败了，很多报错，现在看来是镜像源的问题。
然后尝试在 Hyper-V 虚拟机中安装，过程很顺利，基本没有问题。
最后再次尝试在旧电脑物理机上安装，有了虚拟机的经验，安装也比较顺利。
**唯一失败的就是：分区时没注意磁盘，将分区信息写到了系统u盘，导致u盘数据丢失。惨痛的教训 `lsblk` 或者 `fdisk -l` 很重要！**

## 安装 Arch Linux 系统

首先进入 Arch Live 环境（archiso），是官方 ISO 引导后的安装环境。

~~~
Arch Linux 6.15.8-arch1-2 (tty1)

archiso login:root (automatic login)

To install Arch Linux follow the installation guide:
https://wiki.archlinux.org/title/Installation_guide

For Wi-Fi,authenticate to the wireless network using the iwctl utility.
For mobile broadband (WWAN) modems,comnect with the mmcli utility.
Ethernet,WLAN and WWAN interfaces using DHCP should work automatically.

After comnecting to the internet,the installation guide can be accessed
via the convenience script Installation_guide.

root@archiso ~ #
~~~

### 配置网络

`ping archlinux.org -c 3` 确认是否有网络

如果是有线网络，通常自动就有网络。如果是 WIFI ，使用 `iwctl` 命令：

~~~bash
iwctl
# 交互模式下（示例）
device list
station wlan0 scan
station wlan0 get-networks
station wlan0 connect YOUR_SSID
station list # 用于查看连接状态
# exit 返回
~~~

### 启动模式

`ls /sys/firmware/efi/efivars` 用于输出 **EFI 变量**，区分启动模式是 BIOS 还是 UEFI。

* BIOS 启动：内核只会得到传统的硬件初始化信息，不会加载 EFI 相关功能。
* UEFI 启动：内核会通过 UEFI 固件接口（EFI Runtime Services）获得一系列 EFI 变量（比如引导顺序、启动项、安全启动开关等）。Linux 内核会把这些变量暴露在文件系统里，就是 `/sys/firmware/efi/efivars`。

所以 UEFI 启动必须有一个 **EFI 分区 (ESP)**，格式化为 FAT32，挂载到 `/boot` 或 `/boot/efi`。

#### BIOS 与 UEFI

BIOS：

* 历史悠久：BIOS（Basic Input/Output System）是上世纪 80 年代就有的固件。
* 分区表限制：BIOS 通常和 **MBR 分区表**搭配使用。MBR 最大只支持 **2TB 硬盘容量**，最多 4 个主分区。
* 启动方式：BIOS 启动时，会从磁盘开头的 **MBR (Master Boot Record)** 读取引导代码，然后加载操作系统。
* 兼容性好：老机器几乎都是 BIOS，新机器大多支持兼容模式（CSM），可以让 BIOS 模式继续使用。

UEFI：

* 现代标准：UEFI（Unified Extensible Firmware Interface）是 BIOS 的替代品，大多数 2015 年以后的电脑默认用 UEFI。
* 分区表支持：UEFI 通常和 **GPT 分区表**搭配。GPT 支持 **>2TB 的硬盘**，分区数量几乎无限制。
* 启动方式：UEFI 会读取硬盘上的 **EFI 系统分区 (ESP)**，里面存放引导程序（例如 `grubx64.efi` 或 `systemd-boot`）。
* 功能更强：支持图形界面、鼠标操作、安全启动（Secure Boot）、多系统管理更方便。

### 分区设置

**一定注意分区设置的位置！**
**事先使用 `lsblk` 或者 `fdisk -l` 命令查看磁盘信息，确定分区位置。**

#### 创建分区

~~~bash
fdisk /dev/sda
~~~

然后依次输入：

~~~
g                   # 创建 GPT 分区表

n                   # 新建分区 1
<回车>              # 分区号，直接回车（默认 1）
<回车>              # 起始扇区，直接回车（默认）
+512M               # 结束扇区，输入大小 → +512M
t                   # 改类型
1                   # 选择分区 1
1                   # 设置为 EFI System

n                   # 新建分区 2
<回车>              # 分区号，直接回车（默认 2）
<回车>              # 起始扇区，直接回车
+2G                 # 结束扇区，输入大小 → +2G
t                   # 改类型
2                   # 选择分区 2
19                  # 设置为 Linux swap

n                   # 新建分区 3
<回车>              # 分区号，直接回车（默认 3）
<回车>              # 起始扇区，直接回车
<回车>              # 结束扇区，直接回车（用完剩余空间）

w                   # 保存并退出
~~~

#### 格式化分区

~~~bash
# EFI 分区
mkfs.fat -F32 /dev/sda1

# swap 分区
mkswap /dev/sda2
swapon /dev/sda2

# 根分区
mkfs.ext4 /dev/sda3
~~~

#### 挂载分区

~~~bash
mount /dev/sda3 /mnt
mkdir -p /mnt/boot
mount /dev/sda1 /mnt/boot
~~~

### 配置镜像源（可选）

1. 临时使用国内镜像
   在 live 环境里，修改 pacman 的镜像源列表：
    ~~~bash
    # 先备份原来的
    cp /etc/pacman.d/mirrorlist /etc/pacman.d/mirrorlist.bak
    
    # 编辑镜像列表
    nano /etc/pacman.d/mirrorlist
    ~~~
   把国内源放到前面，例如：
    ~~~
    Server = https://mirrors.tuna.tsinghua.edu.cn/archlinux/$repo/os/$arch
    Server = https://mirrors.ustc.edu.cn/archlinux/$repo/os/$arch
    Server = https://mirrors.aliyun.com/archlinux/$repo/os/$arch
    ~~~
   > 注意：把想用的镜像放在 **最上面**，pacman 会优先使用。
   保存退出后，运行：
    ~~~bash
    pacman -Syyu
    ~~~
2. 选择最快的镜像
   Arch 自带 `reflector` 工具（Live ISO 可能没有，需要先安装）：
    ~~~bash
    pacman -Sy reflector --noconfirm
    reflector --country China --latest 5 --sort rate --save /etc/pacman.d/mirrorlist
    ~~~
   会自动选择最近最快的中国镜像。

### 安装基础系统

~~~bash
pacstrap /mnt base linux linux-firmware vim nano networkmanager
~~~

安装完成后生成 fstab：

~~~bash
genfstab -U /mnt >> /mnt/etc/fstab
~~~

然后进入新系统环境：

~~~bash
arch-chroot /mnt
~~~

## 安装并配置 bootloader（**UEFI 推荐 GRUB 或 systemd-boot**）

#### 使用 GRUB（UEFI）

~~~bash
pacman -S --noconfirm grub efibootmgr dosfstools os-prober mtools
grub-install --target=x86_64-efi --efi-directory=/boot --bootloader-id=GRUB
grub-mkconfig -o /boot/grub/grub.cfg
~~~

#### 使用 GRUB（BIOS）

~~~bash
pacman -S --noconfirm grub
grub-install --target=i386-pc /dev/sda   # 注意写在磁盘（如 /dev/sda），不是分区
grub-mkconfig -o /boot/grub/grub.cfg
~~~

### 系统其余配置

1. 时区：
    ~~~bash
    ln -sf /usr/share/zoneinfo/Asia/Taipei /etc/localtime
    hwclock --systohc
    ~~~
2. 本地化（示例同时启用 zh\_CN.UTF-8 与 en\_US.UTF-8）：
    ~~~bash
    sed -i 's/^#zh_CN.UTF-8/zh_CN.UTF-8/' /etc/locale.gen
    sed -i 's/^#en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen
    locale-gen
    echo LANG=zh_CN.UTF-8 > /etc/locale.conf
    echo KEYMAP=us > /etc/vconsole.conf   # 如需中文控制台可改为 zh_CN
    ~~~
3. 主机名与 hosts：
    ~~~bash
    echo arch > /etc/hostname
    cat >> /etc/hosts <<EOF
    127.0.0.1	localhost
    ::1		    localhost
    EOF
    ~~~
4. root 密码：
    ~~~bash
    passwd
    ~~~

### 安装 ssh 服务

`sudo pacman -S --noconfirm openssh`
`sudo systemctl enable sshd`
`sudo systemctl start sshd`

记得编辑`/etc/ssh/sshd_config`:

~~~
PasswordAuthentication yes   # 允许密码登录
PermitRootLogin yes          # 如果你用 root 登录（可选）
UsePAM yes                   # 必须启用 PAM
~~~

`sudo systemctl restart sshd`

## 安装 KDE 桌面环境

`sudo pacman -Syu` 更新系统
`sudo pacman -S --noconfirm xorg` 安装 Xorg（显示服务器）

安装 KDE Plasma 桌面和常用应用：

* `sudo pacman -S --noconfirm plasma kde-system-meta kde-utilities-meta` 最小化安装，比较轻量
* `sudo pacman -S --noconfirm plasma kde-applications` 完整安装（含所有 KDE 应用，比如浏览器、相册、邮件客户端等）

安装登录管理器（推荐 SDDM）：

~~~bash
sudo pacman -S --noconfirm sddm
sudo systemctl enable sddm
~~~

`sudo pacman -S noto-fonts noto-fonts-cjk noto-fonts-emoji adobe-source-han-sans-cn-fonts adobe-source-han-serif-cn-fonts` 安装 KDE 常用中文字体

手动指定QT环境变量，在 `~/.xprofile` 或 `~/.bashrc` 里加上：

~~~bash
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8
export QT_QPA_PLATFORMTHEME=kde
~~~


