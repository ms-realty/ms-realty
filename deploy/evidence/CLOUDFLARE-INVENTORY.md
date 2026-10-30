# MS Realty Cloudflare inventory

Captured: 2026-10-25T16:01:26.709Z. Account: 921d0224dcd595c87b7928d2b3c479d1. Read-only; no DNS or production route mutations.

Historical source: `legacy-app-final:wrangler.jsonc` and preserved launch checklist. This is not a live resource claim:

| Resource                   | Name                                          | Purpose                                                             |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| Worker                     | ms-realty                                     | Legacy application gateway; do not change its production routes.    |
| Container / Durable Object | MsRealtyContainer / MS_REALTY                 | Legacy Node runtime; container disk is ephemeral.                   |
| R2                         | ms-realty-media                               | Legacy media; staging must use a different bucket.                  |
| Email binding              | EMAIL                                         | Legacy send_email binding restricted to the verified agency inbox.  |
| Database                   | Neon PostgreSQL (historical launch checklist) | Provider and server major version require a fresh runtime readback. |

## Current account readback

### Account

Status: verified.

- {"id":"921d0224dcd595c87b7928d2b3c479d1","name":"Ms.realty.bg@gmail.com's Account"}

### Zones

Status: verified.

- {"id":"f0ac7af0721419e8129e5d10ff547372","name":"makler-realty.com","status":"active","account_id":"921d0224dcd595c87b7928d2b3c479d1"}

### Workers

Status: verified.

- {"id":"ms-realty","created_on":"2026-07-26T15:21:47.101083Z","modified_on":"2026-09-16T23:09:37.337054Z"}
- {"id":"ms-realty-route-watchdog","created_on":"2026-10-18T13:13:55.137129Z","modified_on":"2026-10-18T13:49:45.727634Z"}
- {"id":"ms-realty-staging","created_on":"2026-10-14T09:50:25.340117Z","modified_on":"2026-10-24T15:32:47.561837Z"}
- {"id":"ms-realty-under-construction","created_on":"2026-09-03T10:29:39.552746Z","modified_on":"2026-09-03T11:41:49.901148Z"}
- {"id":"msr-monitoring-drill-32442575503-1","created_on":"2026-08-21T03:13:47.354704Z","modified_on":"2026-08-21T03:13:47.354704Z"}
- {"id":"msr-monitoring-drill-34327974950-1","created_on":"2026-09-09T08:15:10.626774Z","modified_on":"2026-09-09T08:18:21.164842Z"}

### Containers

Status: verified.

- {"id":"a032e473-14c0-4d1a-abbf-1366c653ff7b","name":"msr-monitoring-drill-40176895504-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-40176895504-1-msrealtycontainer@sha256:416d8f477b3c79c6f1d2f01be58f2fa5f6ade3c288e76d05d355ac0019bb9686"}
- {"id":"a03a7db1-ad3b-4422-8009-d4e789057d57","name":"msr-monitoring-drill-40077149323-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-40077149323-1-msrealtycontainer@sha256:1b918bc3930ab778809bfd5b068df4e5277e1ecf7fa9f4d1b03d9eaeacd89932"}
- {"id":"a03fa530-020c-4e81-9ad8-b309ccacf932","name":"msr-monitoring-drill-39925999683-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-39925999683-1-msrealtycontainer@sha256:5bdfcd2760c83fe20101ffec308102f9cb9352f30e69e707a97e211012f216e7"}
- {"id":"a03d5d96-e79e-4a2d-b12f-2957ed25af27","name":"msr-monitoring-drill-39749700211-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-39749700211-1-msrealtycontainer@sha256:a1f0995453657fdb43e269c99431a66e2bcd821c570cc62f32592ba903959efb"}
- {"id":"a033761f-ecfd-4bad-8e9c-daf4282b136b","name":"msr-monitoring-drill-39570938199-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-39570938199-1-msrealtycontainer@sha256:7e5c4bf6012e139bcf09cbeb3f0573e70797c6a98734667a9b5dc5c0a25420a7"}
- {"id":"a03f747a-5924-458b-b737-1611d03f64c9","name":"msr-monitoring-drill-39394845418-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-39394845418-1-msrealtycontainer@sha256:ca00ce6fefb1707e9c5ae5490d37cdeefa41ad5f4121419e802434e127453c60"}
- {"id":"a03a1c21-0940-4e2f-84cf-121f8dd800ee","name":"msr-monitoring-drill-39226810974-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-39226810974-1-msrealtycontainer@sha256:e860d7c481dcad6a3ccfb17d30b88432804bc7eacb30ebae634db8c6c9351eee"}
- {"id":"a03a43e7-a7e3-433e-8b49-239f435de011","name":"ms-realty-route-watchdog-originprobe","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/ms-realty-origin-probe@sha256:e934314796483db6633af4208c307fea0347fe00b59718564515d7ca83845ea9"}
- {"id":"a03596e7-642d-44a9-845a-cdedcdbf8423","name":"msr-monitoring-drill-39110212221-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-39110212221-1-msrealtycontainer@sha256:a4cd6c6500bd2a723920a8976b4178b269e8464d3649c3c054ecc3fd69ace44a"}
- {"id":"a034383f-227e-47f1-ad66-8e94c2f712ca","name":"msr-monitoring-drill-39015252008-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-39015252008-1-msrealtycontainer@sha256:8ee5659451f69ea20b70c88db6d628ab55f914f5b18f0ed7e092afb5c02d230b"}
- {"id":"a0376007-6c07-47e9-bccc-b8463fc4c9fd","name":"msr-monitoring-drill-38872528344-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-38872528344-1-msrealtycontainer@sha256:ab85e1b1cf75b264d3ee36e99af6583a204f202c976698c12fa10603486a24f2"}
- {"id":"a03f4493-9ad8-4dc1-bbdb-78dcf9997cda","name":"msr-monitoring-drill-38705325796-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-38705325796-1-msrealtycontainer@sha256:1d2ce970e041f6d8200083e693d930bb3175e8acd9f9b7819ee0403c0fdba993"}
- {"id":"a031271b-c68f-4c4f-a283-b21d2fdfc2d2","name":"ms-realty-staging-msrealtymigratorcontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/ms-realty-staging@sha256:f1c1ea8c76caa41878beb79b046efb0e805c000b10d8219dc45b3c0b4a2dbc6c"}
- {"id":"a0373338-03fe-4d69-af78-caf6cdf0fd2a","name":"ms-realty-staging-msrealtyworkercontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/ms-realty-staging@sha256:f1c1ea8c76caa41878beb79b046efb0e805c000b10d8219dc45b3c0b4a2dbc6c"}
- {"id":"a037a9e4-6978-42a4-9c23-855a2a904067","name":"ms-realty-staging-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/ms-realty-staging@sha256:f1c1ea8c76caa41878beb79b046efb0e805c000b10d8219dc45b3c0b4a2dbc6c"}
- {"id":"a0329955-0c5f-46f9-9275-4d1f27a5cf30","name":"msr-monitoring-drill-38537744778-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-38537744778-1-msrealtycontainer@sha256:47e7972096766881b0dc7a06ebedf3ca8e6473bc44a04fa18bd9c7fd26f75ba6"}
- {"id":"a037b7f9-a4a2-4dc9-a29c-6d711c2d0099","name":"msr-monitoring-drill-38385250399-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-38385250399-1-msrealtycontainer@sha256:22aba620ae751dc1a79ccb27fdaa8483a1dd5e3abb24773323bed699bdfd58a8"}
- {"id":"a03464af-c6e6-4202-82ac-6ea2ca59fadf","name":"msr-monitoring-drill-38239726839-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-38239726839-1-msrealtycontainer@sha256:dfcc6fdd36c7ab9513d7f1eef645bc414b4752705ab52aa1e4cf3090b1a57ec5"}
- {"id":"a0361d15-dd0d-410b-9361-320e22c766a4","name":"msr-monitoring-drill-38130732564-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-38130732564-1-msrealtycontainer@sha256:4b868fd14cb2c4544376dced8ffeddfdcb412168aa171ee74b35b0d07d43b06b"}
- {"id":"a032668a-8a0a-4731-9255-dd489200c559","name":"msr-monitoring-drill-38043154827-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-38043154827-1-msrealtycontainer@sha256:dd33f565de69b17c418171498b7af58d2ec3fa70bf6c2ec248c47c478a856945"}
- {"id":"a03cfb21-f093-450e-89a5-8010b60eff51","name":"msr-monitoring-drill-37919020815-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-37919020815-1-msrealtycontainer@sha256:12633600c79d739bef91a72a142b4c90b1f3e93eca329e721ce0ce2f1e4b3710"}
- {"id":"a030124c-df72-48ab-a844-f214efaf38a9","name":"msr-monitoring-drill-37765104402-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-37765104402-1-msrealtycontainer@sha256:a80ded54d04e14bd0156f83134fa149b5a4eb1d9db8266af333f5e037d36396e"}
- {"id":"a03b2a64-5c45-47bc-8bf4-cf360035040c","name":"msr-monitoring-drill-37606849408-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-37606849408-1-msrealtycontainer@sha256:b2d75951d615c713944a2206bdacfc4aa00919e9c67bd327e45c93dc7c960749"}
- {"id":"a035dbca-afab-4a23-94bf-b1d12b6091d3","name":"msr-monitoring-drill-37449765691-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-37449765691-1-msrealtycontainer@sha256:a788dd47db500396cbceeaf2cf4a376bc5e14bfd0f8af244a33d1595ccfa3409"}
- {"id":"a03ff5e3-1fe1-4bbc-b292-9e615df95139","name":"msr-monitoring-drill-37297408520-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-37297408520-1-msrealtycontainer@sha256:ccd8471f22d7d92205938bd5a181d72959c65092325439c9b9919412b76f0de5"}
- {"id":"a03e801c-32f8-40ca-b652-aefb691830e0","name":"msr-monitoring-drill-37193568353-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-37193568353-1-msrealtycontainer@sha256:44123625f686b86c191bcd9e9d074428915f57d60643102459e3218ae1b57761"}
- {"id":"a031eb1c-66ef-4bfa-a3d7-0cf9c0367d95","name":"msr-monitoring-drill-37112352056-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-37112352056-1-msrealtycontainer@sha256:e321905b994fd416aaae676c1b61e894a45226b6331f6bed98672fdc1d2c06ab"}
- {"id":"a0385f0d-a168-4d1d-8b8f-0ad38dbb7886","name":"msr-monitoring-drill-36992216162-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-36992216162-1-msrealtycontainer@sha256:a2b495a8cd80e9187bd03f24454ec1aa57986c6e757f6f7d84f9becebffe299e"}
- {"id":"a0356844-96be-4356-9ee4-5ab62a2e22b1","name":"msr-monitoring-drill-36847841087-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-36847841087-1-msrealtycontainer@sha256:0c3fa4edd174908d4b747fb70d23af315d4dee2f3a7f4f3be055735120f0f201"}
- {"id":"a038bb03-8268-411d-b732-c815a39c889d","name":"msr-monitoring-drill-36698343829-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-36698343829-1-msrealtycontainer@sha256:eb3e3650a1220e2cd63da253758694cca86730d292f5d7db102808c4694f2ef9"}
- {"id":"a03fc384-8b46-4136-b5b2-dcc16e8fe42a","name":"msr-monitoring-drill-36552272656-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-36552272656-1-msrealtycontainer@sha256:a8575672eeb2a6284ac98220c04073534570f942d6ea69e9faa63ef1fa2b8798"}
- {"id":"a0368ab4-2592-41e6-b79f-b689719cce70","name":"msr-monitoring-drill-36406376951-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-36406376951-1-msrealtycontainer@sha256:7aa16c249bf5c695ce85a7d542fefcaaf4250bac754d57f2250e55005320859a"}
- {"id":"a03f8067-a0b5-4e94-b3e5-19f0448898e7","name":"msr-monitoring-drill-36309060847-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-36309060847-1-msrealtycontainer@sha256:480fbe275fdd085e4b7201089846a9e052390aff026f9ac46146323eecb8118b"}
- {"id":"a03d2ba1-34bf-4b8e-97ac-f1db612584de","name":"msr-monitoring-drill-36230475517-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-36230475517-1-msrealtycontainer@sha256:e15fd48e3b31c4a2b23eef4cbcabe5d5d691a58edd0d8c6b5b54071331f32823"}
- {"id":"a03e75b2-62a5-4543-89e9-9f6cdeb05188","name":"msr-monitoring-drill-36115422760-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-36115422760-1-msrealtycontainer@sha256:5c7fb0f40101d0e68b3197a00100d4eccea6fcf2eb4dd3c764f4a45842b654aa"}
- {"id":"a03cd32b-6cce-4a00-9bc4-92832b1fcdcc","name":"msr-monitoring-drill-35975816667-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-35975816667-1-msrealtycontainer@sha256:4eb1220bc932ba47db3b0228f3845c661134141f51c8b3e7ada7609fc7660ff5"}
- {"id":"a031d871-f796-4a1f-8da3-27d8c2992e55","name":"msr-monitoring-drill-35838370843-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-35838370843-1-msrealtycontainer@sha256:1da47799b6a5c53ffbd7dafd4e51f1b351c0a7fd47314cc1592f2300008442da"}
- {"id":"a03aad3d-1705-459c-b103-5b91fe9ff858","name":"msr-monitoring-drill-35705802011-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-35705802011-1-msrealtycontainer@sha256:4f2810d46ed2ba760667757faf1562e69951be168a53fce4a3a0474c6a44663f"}
- {"id":"a030bb6e-c751-480e-a757-b76bdcdc1e57","name":"msr-monitoring-drill-35581097358-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-35581097358-1-msrealtycontainer@sha256:859fb6c88ecc396352b0ddd2d70f10b1827ece1b9c19a8734ab8a5f45f877184"}
- {"id":"a033d7dc-bff7-471a-84c3-f944e52731ac","name":"msr-monitoring-drill-35500171118-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-35500171118-1-msrealtycontainer@sha256:1e5ba754eba88907cfe1b946b77c68aab763a060f4dea15023b3bbc40ff76a11"}
- {"id":"a03d79a6-eb82-4692-8515-73b59288548a","name":"msr-monitoring-drill-35431155227-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-35431155227-1-msrealtycontainer@sha256:533f7c81bf6624c161702ec3e7bd0100ec06853b33db4faddcade3a479d5afe0"}
- {"id":"a0396418-bde5-44e1-843a-3194135d6a8f","name":"msr-monitoring-drill-35323780614-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-35323780614-1-msrealtycontainer@sha256:c273ef6090293126296d4ede39826dd175906027c10d8fa6c890915088e4c46e"}
- {"id":"a03286be-9e3a-4f11-8982-f27b5ac7d7ed","name":"msr-monitoring-drill-35201235169-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-35201235169-1-msrealtycontainer@sha256:2796b8400b604707be1fb67a988a52d1b35547bfa66258c140be1075c973b90a"}
- {"id":"a0374047-a690-4e87-b234-e2ef2a75db6e","name":"msr-monitoring-drill-35074999299-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-35074999299-1-msrealtycontainer@sha256:68b984ba5ece7d13d2f374a2e1e652122b8c35f8caa6aba81502e2bf6584ef33"}
- {"id":"a03732e2-5e9b-4569-b838-0b2c22143735","name":"msr-monitoring-drill-34948719230-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-34948719230-1-msrealtycontainer@sha256:c4709e456dc57eb896ddcd7f9afeb84df4320a32b72f37cc532c2a049c30d628"}
- {"id":"a034df0b-337a-45a6-b415-73315d053464","name":"msr-monitoring-drill-34825716892-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-34825716892-1-msrealtycontainer@sha256:ddfd8c3aa2ac2823ff63cd8d5009dd5f49fe6be3caf4420b61778171ed5bd92d"}
- {"id":"a038a99e-800c-49bf-9a14-cad509a3d81f","name":"msr-monitoring-drill-34682092482-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-34682092482-1-msrealtycontainer@sha256:4a28af5f7837f6cb182f89c60d78e1c0949ce3998d14822eccfbf24cd2766676"}
- {"id":"a038b8b1-5ef9-49d9-b012-967bce1cd536","name":"msr-monitoring-drill-34577642623-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-34577642623-1-msrealtycontainer@sha256:044830b6cc1a5dc88985385f243d3da83d049d75f1004072d5b50f50cc9b4f78"}
- {"id":"a03ec2ab-e487-45c2-b383-0d293dcec935","name":"msr-monitoring-drill-34453949446-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-34453949446-1-msrealtycontainer@sha256:ab926aff68cab75875b6468dcef0fb29c6429fd626cdb0dd9be6e840c515fde2"}
- {"id":"a032ea12-fd4d-41cb-8052-213db51afe74","name":"msr-monitoring-drill-34377182932-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-34377182932-1-msrealtycontainer@sha256:d303863a0c06b8423c3817f4c114e134819995d4dc4efb62b6c764484ac19fe5"}
- {"id":"a037984e-c538-4517-af5a-ab562f2d0239","name":"msr-monitoring-drill-34327974950-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-34327974950-1-msrealtycontainer@sha256:55e38e4dde6985b5f70d68b6a39191878c7b270c5e68361da482a33a65952095"}
- {"id":"a031aed4-8eb9-4bc4-9c6c-1c61d262c638","name":"msr-monitoring-drill-34202976360-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-34202976360-1-msrealtycontainer@sha256:1c821e29b3a3311f4d15606d6b3dfc0c7bc7775b82679e10b3b7e51df4c26407"}
- {"id":"a0365992-9626-438a-baf8-8b9e27319096","name":"msr-monitoring-drill-34100419049-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-34100419049-1-msrealtycontainer@sha256:d0b8a1f47259678610c4f330a40b13bd2072bf98ab34033a4d3ef3a0b5e84b53"}
- {"id":"a0330707-261d-4e12-b97c-eb02230512de","name":"msr-monitoring-drill-34020534110-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-34020534110-1-msrealtycontainer@sha256:5c469fd0d5fc29864cd78cd1f194ff03109f815e608043b768d3f759aab2b3ce"}
- {"id":"a0376f2d-5b2f-4c7e-909c-863c98f31020","name":"msr-monitoring-drill-33953326653-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-33953326653-1-msrealtycontainer@sha256:771bdcbc208821f6d1a35f34f7671df142bd69829f268bdeb613c966f9109298"}
- {"id":"a0391c51-8731-41b7-bf31-91a5e658140f","name":"msr-monitoring-drill-33873052007-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-33873052007-1-msrealtycontainer@sha256:7af04956d232c8dc77f6a59597f8a0141e885c59e5daf6b3df1e9ba63ce7d8dc"}
- {"id":"a03ff749-9be0-468c-b0ba-5c7372f5f9cb","name":"msr-monitoring-drill-33452579727-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-33452579727-1-msrealtycontainer@sha256:286dc4f47ce3c75e97b026865448ad8fa4fc4a7b74d55a81c294bba354451b07"}
- {"id":"a0375c30-cf55-4303-8179-b262948eeff9","name":"msr-monitoring-drill-33448673358-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-33448673358-1-msrealtycontainer@sha256:31cc23c285c7d8e8a2886907a85a8129ccfc078a2830f34fbccb435ae61da356"}
- {"id":"a0391ad2-877b-4744-9219-ba7e33fc739b","name":"msr-monitoring-drill-33273746497-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-33273746497-1-msrealtycontainer@sha256:e239001479249ce5c09e6be09b47ea32e93c2e0f11523d308c6c3119fb80fe82"}
- {"id":"a033f043-4cda-4e23-b0d3-fb5b7e4aec81","name":"msr-monitoring-drill-33129760234-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-33129760234-1-msrealtycontainer@sha256:4e39f98bb7a4244c223ce9df4415e2257192dc7b2676cc6207f0d4d2039c4418"}
- {"id":"a03ed09b-5779-41e3-ab75-47c270893fba","name":"msr-monitoring-drill-33127651580-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-33127651580-1-msrealtycontainer@sha256:36ef11e39e4b30e461ed25c6865491dc51ab3c2da1bbc4c35b6d5f85965e4fe2"}
- {"id":"a03c0dec-88e5-47f8-b709-d43fc3d55012","name":"msr-monitoring-drill-33022171474-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-33022171474-1-msrealtycontainer@sha256:a7bab91a757505e514662bc479266d609611794603688b2b63b3f31ac34343ac"}
- {"id":"a0382b0d-69fe-499d-a559-1a2e1ea90aff","name":"msr-monitoring-drill-32761831128-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-32761831128-1-msrealtycontainer@sha256:4c2cdf4cd8da92610d87d4c7cb1a815963185b99bb4b70721e39e75410f27f52"}
- {"id":"a03fadb4-be04-4ab4-9b25-5def2b8c80c7","name":"msr-monitoring-drill-32502520584-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-32502520584-1-msrealtycontainer@sha256:58984bdc0fe047766bc54359f2db2a2561ac389e348a270c22b1964d4ec206cd"}
- {"id":"a03c2cc7-a825-4a72-b3e6-3dd631883dd1","name":"msr-monitoring-drill-32500870396-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-32500870396-1-msrealtycontainer@sha256:128e2937fae9c30d368b551cdcb742dc10dc3d46b60339701805033fd9b2d18c"}
- {"id":"a0394d4f-22dc-4e8e-a82b-0ce28174386e","name":"msr-monitoring-drill-32446094475-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-32446094475-1-msrealtycontainer@sha256:c91391378b47951671ee7b90b58ccc4ad485a99db5036346698d99597633f845"}
- {"id":"a03a17af-2f61-4fdd-8304-4a442be3e02e","name":"msr-monitoring-drill-32444387052-1-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/msr-monitoring-drill-32444387052-1-msrealtycontainer@sha256:4fc0b77f7630fafcd486e5a42342c6a34afbf2919d892ab03b3be67c61d8f6f3"}
- {"id":"a0352c6c-3883-4412-ba76-6c9562431357","name":"ms-realty-msrealtycontainer","scheduling_policy":"default","image":"registry.cloudflare.com/921d0224dcd595c87b7928d2b3c479d1/ms-realty-msrealtycontainer@sha256:bcbc83d97646b3896d8dbf68d2b55fe966b02f4ca30492944b174a2b06f4717a"}

### Durable Object namespaces

Status: verified.

- {"id":"1c59f30340e941de98beb3fd7ad05399","name":"ms-realty_MsRealtyContainer","script":"ms-realty","class":"MsRealtyContainer"}
- {"id":"edffaf9e3d5e49a0a94e126ce2e38c17","name":"msr-monitoring-drill-32442575503-1_MsRealtyContainer","script":"msr-monitoring-drill-32442575503-1","class":"MsRealtyContainer"}
- {"id":"5a6b6676798a40138837e0d2f2795c4b","name":"msr-monitoring-drill-34327974950-1_MsRealtyContainer","script":"msr-monitoring-drill-34327974950-1","class":"MsRealtyContainer"}
- {"id":"3cce765281d3461eb0fb5837a41d9153","name":"ms-realty-staging_EmailReceipt","script":"ms-realty-staging","class":"EmailReceipt"}
- {"id":"fdafde1c004a497a8129d52be7e47cda","name":"ms-realty-staging_MsRealtyContainer","script":"ms-realty-staging","class":"MsRealtyContainer"}
- {"id":"2d57596e19964c76a76daf487d77add8","name":"ms-realty-staging_MsRealtyMigratorContainer","script":"ms-realty-staging","class":"MsRealtyMigratorContainer"}
- {"id":"0717f4a36ed647edab24146d725ed36a","name":"ms-realty-staging_MsRealtyWorkerContainer","script":"ms-realty-staging","class":"MsRealtyWorkerContainer"}
- {"id":"e98cf4772fa84e3399837542f434647c","name":"ms-realty-route-watchdog_RouteWatchdog","script":"ms-realty-route-watchdog","class":"RouteWatchdog"}
- {"id":"ab7b448cf57445bdb48a474c534588d5","name":"ms-realty-route-watchdog_OriginProbe","script":"ms-realty-route-watchdog","class":"OriginProbe"}

### Hyperdrive

Status: unverified (HTTP 403; codes 10000).

Resource existence remains unknown.

### D1

Status: unverified (HTTP 401; codes 10000).

Resource existence remains unknown.

### R2

Status: verified.

- {"name":"ms-realty-media","creation_date":"2026-07-27T11:25:46.590Z"}
- {"name":"ms-realty-production-opennext-cache","creation_date":"2026-07-29T13:22:39.801Z"}
- {"name":"ms-realty-staging-media","creation_date":"2026-10-05T13:08:53.243Z"}
- {"name":"ms-realty-staging-opennext-cache","creation_date":"2026-10-05T13:09:08.545Z"}

### Access applications

Status: verified.

No resources returned.

### Access service tokens

Status: verified.

No resources returned.

### Bindings: ms-realty

Status: verified.

- {"bindings":[{"name":"DATABASE_URL","type":"secret_text"},{"name":"EMAIL","type":"send_email","destination_count":1},{"name":"MEDIA","type":"r2_bucket","bucket_name":"ms-realty-media"},{"name":"MEDIA_INGEST_SECRET","type":"secret_text"},{"name":"MS_REALTY","type":"durable_object_namespace","class_name":"MsRealtyContainer","namespace_id":"1c59f30340e941de98beb3fd7ad05399"},{"name":"MS_REALTY_ADMIN_CREDENTIALS_JSON","type":"secret_text"},{"name":"MS_REALTY_CASE_PAYLOAD_AUTHORITY_ENABLED","type":"secret_text"},{"name":"MS_REALTY_EDGE_BUILD_MARKER","type":"plain_text"},{"name":"MS_REALTY_EMAIL_FROM","type":"plain_text"},{"name":"MS_REALTY_EMAIL_FROM_NAME","type":"plain_text"},{"name":"MS_REALTY_EMAIL_SEND_SECRET","type":"secret_text"},{"name":"MS_REALTY_EMAIL_SEND_URL","type":"plain_text"},{"name":"MS_REALTY_EVENT_DURABLE_STORE_ENABLED","type":"plain_text"},{"name":"MS_REALTY_LEAD_CONTACT_KEY","type":"secret_text"},{"name":"MS_REALTY_LEAD_DURABLE_STORE_ENABLED","type":"plain_text"},{"name":"MS_REALTY_LEAD_OPS_DURABLE_STORE_ENABLED","type":"plain_text"},{"name":"MS_REALTY_ORIGIN_TOKEN","type":"secret_text"},{"name":"MS_REALTY_ORIGIN_URL","type":"plain_text"},{"name":"MS_REALTY_PREVIEW_ADMIN_KEY","type":"secret_text"},{"name":"MS_REALTY_PUBLIC_ORIGIN","type":"secret_text"},{"name":"MS_REALTY_VIEWING_DURABLE_STORE_ENABLED","type":"plain_text"},{"name":"MS_REALTY_WORKER_PUBLIC_ORIGIN","type":"plain_text"},{"name":"MS_REALTY_WORKSPACE_ID","type":"plain_text"},{"name":"PAYLOAD_SECRET","type":"secret_text"}]}

### Bindings: ms-realty-route-watchdog

Status: verified.

- {"bindings":[{"name":"ORIGIN_PROBE","type":"durable_object_namespace","class_name":"OriginProbe","namespace_id":"ab7b448cf57445bdb48a474c534588d5"},{"name":"ROUTE_WATCHDOG","type":"durable_object_namespace","class_name":"RouteWatchdog","namespace_id":"e98cf4772fa84e3399837542f434647c"},{"name":"WATCHDOG_CONTROLLER_PUBLIC_KEY","type":"plain_text"},{"name":"WATCHDOG_CONTROL_SECRET","type":"secret_text"},{"name":"WATCHDOG_ORIGIN","type":"plain_text"},{"name":"WATCHDOG_OWNER_PUBLIC_KEY","type":"plain_text"},{"name":"WATCHDOG_PROBE_IMAGE_DIGEST","type":"plain_text"},{"name":"WATCHDOG_PROBE_SOURCE_COMMIT","type":"plain_text"},{"name":"WATCHDOG_SOURCE_COMMIT","type":"plain_text"},{"name":"WATCHDOG_SOURCE_SHA256","type":"plain_text"},{"name":"WATCHDOG_VERSION","type":"version_metadata"}]}

### Bindings: ms-realty-staging

Status: verified.

- {"bindings":[{"name":"ACCESS_AUD","type":"plain_text"},{"name":"ACCESS_SERVICE_CLIENT_ID","type":"plain_text"},{"name":"ACCESS_SERVICE_CLIENT_SECRET","type":"secret_text"},{"name":"ACCESS_TEAM_DOMAIN","type":"plain_text"},{"name":"APP_ORIGIN","type":"plain_text"},{"name":"AUTH_SECRET","type":"secret_text"},{"name":"BUILD_SHA","type":"plain_text"},{"name":"CANONICAL_ORIGIN","type":"plain_text"},{"name":"CLIENT_ORIGIN","type":"plain_text"},{"name":"DATABASE_TLS_CA_PEM","type":"secret_text"},{"name":"DATABASE_TRANSPORT","type":"plain_text"},{"name":"EMAIL","type":"send_email","destination_count":1},{"name":"EMAIL_ALLOWED_RECIPIENTS","type":"plain_text"},{"name":"EMAIL_FROM","type":"plain_text"},{"name":"EMAIL_RECEIPTS","type":"durable_object_namespace","class_name":"EmailReceipt","namespace_id":"3cce765281d3461eb0fb5837a41d9153"},{"name":"EMAIL_RELAY_SECRET","type":"secret_text"},{"name":"EMAIL_REPLY_DOMAIN","type":"plain_text"},{"name":"FILE_SCAN_MODE","type":"plain_text"},{"name":"FILE_STORAGE","type":"plain_text"},{"name":"IMAGE_DIGEST","type":"plain_text"},{"name":"INQUIRY_COVERAGE_NOTICE_ENABLED","type":"plain_text"},{"name":"INQUIRY_COVERAGE_TEST_INBOX","type":"plain_text"},{"name":"INQUIRY_COVERAGE_TEST_INBOX_REVIEWED","type":"plain_text"},{"name":"LEGACY_ROUTES_SHA256","type":"plain_text"},{"name":"LEGACY_TARGET_HOST","type":"plain_text"},{"name":"MAP_RELEASE_ID","type":"plain_text"},{"name":"MEDIA","type":"r2_bucket","bucket_name":"ms-realty-staging-media"},{"name":"MEDIA_PUBLIC_BASE_URL","type":"plain_text"},{"name":"MIGRATOR_DATABASE_URL","type":"secret_text"},{"name":"MS_REALTY","type":"durable_object_namespace","class_name":"MsRealtyContainer","namespace_id":"fdafde1c004a497a8129d52be7e47cda"},{"name":"MS_REALTY_MIGRATOR","type":"durable_object_namespace","class_name":"MsRealtyMigratorContainer","namespace_id":"2d57596e19964c76a76daf487d77add8"},{"name":"MS_REALTY_WORKER","type":"durable_object_namespace","class_name":"MsRealtyWorkerContainer","namespace_id":"0717f4a36ed647edab24146d725ed36a"},{"name":"NEXT_CACHE","type":"r2_bucket","bucket_name":"ms-realty-staging-opennext-cache"},{"name":"ORIGIN_URL","type":"plain_text"},{"name":"ORIGIN_VERIFY_SECRET","type":"secret_text"},{"name":"PUBLIC_MEDIA_SHA256","type":"plain_text"},{"name":"PUBLIC_ORIGIN","type":"plain_text"},{"name":"R2_ACCESS_KEY_ID","type":"secret_text"},{"name":"R2_ACCOUNT_ID","type":"plain_text"},{"name":"R2_BUCKET","type":"plain_text"},{"name":"R2_JURISDICTION","type":"plain_text"},{"name":"R2_SECRET_ACCESS_KEY","type":"secret_text"},{"name":"STAFF_ORIGIN","type":"plain_text"},{"name":"STAGING","type":"plain_text"},{"name":"STAGING_CONNECTIVITY_ONLY","type":"plain_text"},{"name":"STAGING_CONTROL_SECRET","type":"secret_text"},{"name":"STAGING_DATABASE_HOST","type":"plain_text"},{"name":"STAGING_DATABASE_NAME","type":"plain_text"},{"name":"STAGING_MIGRATOR_DATABASE_ROLE","type":"plain_text"},{"name":"STAGING_WEB_DATABASE_ROLE","type":"plain_text"},{"name":"STAGING_WORKER_DATABASE_ROLE","type":"plain_text"},{"name":"TUNNEL_SERVICE_HOSTNAME","type":"plain_text"},{"name":"TUNNEL_SERVICE_TOKEN_ID","type":"plain_text"},{"name":"TUNNEL_SERVICE_TOKEN_SECRET","type":"secret_text"},{"name":"TUNNEL_SERVICE_URL","type":"plain_text"},{"name":"WEBAUTHN_RP_NAME","type":"plain_text"},{"name":"WEB_DATABASE_URL","type":"secret_text"},{"name":"WORKER_DATABASE_URL","type":"secret_text"}]}

### Bindings: ms-realty-under-construction

Status: verified.

- {"bindings":[{"name":"APP","type":"service"}]}

### Worker routes: makler-realty.com

Status: verified.

- {"id":"81f7e530a7cc49e99dc47079b8b18c6d","pattern":"www.makler-realty.com/en*","script":null}
- {"id":"725465e6e4034e20a82afacad6d9a1c0","pattern":"makler-realty.com/nl*","script":null}
- {"id":"87d490c1549f49f580700b20a6a0ca3b","pattern":"makler-realty.com/el*","script":null}
- {"id":"5620b0d788184900a60e400055dfbdab","pattern":"staging-app.makler-realty.com/*","script":"ms-realty-staging"}
- {"id":"a52dae32c18f45e894754ae3065e694b","pattern":"staging-my.makler-realty.com/*","script":"ms-realty-staging"}
- {"id":"236ffdde11cc4de9b3c66f8c6c23d0cf","pattern":"staging.makler-realty.com/*","script":"ms-realty-staging"}
- {"id":"9c7ba2ab02e94c91a6eda117ee0796fc","pattern":"makler-realty.com/bg*","script":null}
- {"id":"b58e210a77374ed4b8b8068214b342fc","pattern":"makler-realty.com/he*","script":null}
- {"id":"61a83937e94f4ad89aea9a16bda1000a","pattern":"www.makler-realty.com/nl*","script":null}
- {"id":"95b10085574a42638b568a0b44ec17e0","pattern":"www.makler-realty.com/de*","script":null}
- {"id":"407d4dfb26c64d2ab4e8f75c6cd6b031","pattern":"www.makler-realty.com/he*","script":null}
- {"id":"54b6ac1b668e44b78d5bc4e698914c4b","pattern":"www.makler-realty.com/el*","script":null}
- {"id":"7a451aabdafe4622b03a9f00c02a3bae","pattern":"makler-realty.com/*","script":null}
- {"id":"adc49bbf42414e58a267103010ea6a45","pattern":"makler-realty.com/ru*","script":null}
- {"id":"c8ed61b387fd470ea8f1ff259c36c86a","pattern":"www.makler-realty.com/ru*","script":null}
- {"id":"af7291dae72745d799e2356eb0852d88","pattern":"www.makler-realty.com/*","script":null}
- {"id":"9270f707b3b94eada16efd40c8267511","pattern":"www.makler-realty.com/bg*","script":null}
- {"id":"0d0ad342d8934133bafea13022aecc78","pattern":"makler-realty.com/de*","script":null}
- {"id":"3f338a1b8028461e93b4b2c5da13ae56","pattern":"makler-realty.com/en*","script":null}
- {"id":"456ccbe3120f4ea08bb052d770c587b7","pattern":"makler-realty.com/","script":null}
- {"id":"3a09c56fe4ba42688a65001b11573a46","pattern":"www.makler-realty.com/","script":null}

### Staging DNS: makler-realty.com

Status: unverified (HTTP 403; codes 10000).

Resource existence remains unknown.

### Email routing: makler-realty.com

Status: unverified (HTTP 403; codes 10000).

Resource existence remains unknown.

## Database engine

Requires SELECT current_setting('server_version_num') against the existing authoritative PostgreSQL setup; Hyperdrive is a connector, D1 is not PostgreSQL.

Do not pin Postgres 18 from local fixtures. The staging database must be distinct and its server major must equal the verified existing provider major. Promotion is blocked until this readback is recorded.

## Staging boundary

Use a separate Worker/Container namespace and bucket. Require existing staging DNS and owner/controller Cloudflare Access protection before route attachment. The deployment workflow cannot change DNS or production routes. DigitalOcean App Platform is superseded.
