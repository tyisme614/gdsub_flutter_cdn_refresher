# Flutter CDN Refresher
- There are plenty of Flutter mirrors, all need to be updated with official Flutter site.
- Mirror server needs a high efficient way to keep versions the newest with official site, and avoid unnecessary update operations on CDN.

The primary function of this project is checking flutter package version from official site and comparing them with the packages of cloud storage that is used as resource mirror of Flutter framework.

This project is based on Aliyun CDN where the mirror resources are cached.

## Prerequisitions
1. NodeJS 0.8 and above
2. Aliyun cli command tool 3.0.10 and above
3. Ubuntu Server 18.04 amd-64

## Check Rules
1. This service would cache the first page of package info list from official site as anchor page.
2. The service would request package info at interval of a customized time value, eg. 15 minutes.
3. As official Flutter site would insert the newly updated pakcage info at the head of the received pakcage list, this service would invoke CDN refreshing if received list is different from the cached 'first' page.

**Note: After running this service for 2 years, we found that the newly updated package would sometimes be inserted at some other position of the package list, not the head of it. So we implemented a service which would run once per day to check all package versions between CDN and official site, and update the inconsistent pakcages to the newest version.**

**powered by** [<img src="https://nodejs.org/static/images/logo.svg" width="64px" height="64px">](https://nodejs.org/en/)
[<img src="https://www.jetbrains.com/company/brand/img/jetbrains_logo.png" width="64px" height="64px">](https://jb.gg/OpenSource/)
[<img src="https://i.pinimg.com/originals/cf/8c/11/cf8c11d285559e700b105abd4adaee56.jpg" width="64px" height="64px">](https://www.aliyun.com/)

*If you have any questions, please feel free to contact yuan@gdsub.com*

