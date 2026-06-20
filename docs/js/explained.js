'use strict';

/* The 1988 source is the frozen docs/SNEEKIE.BAS, embedded below as base64 so the
   page renders even when opened straight from file:// (not just over http). */

/* GW-BASIC tokenizer (tokenizeBasicLine) is shared — see js/site.js */

const BAS = new TextDecoder().decode(Uint8Array.from(atob("JyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0KJyBTTkVFS0lFIC0gKGMpIGp1bGkgJzg4IGJ5IEhlcmJ5U29mdAonIFB1Ymxpc2hlZCBpbiBNUyhYKURPUyBDb21wdXRlciBNYWdhemluZQonIChpc3N1ZSAjMjUsIE9jdG9iZXIgMTk4OCkKJwonIFJlY292ZXJlZCBieSBPQ1IgZnJvbSB0aGUgbWFnYXppbmUncyBwcmludGVkIHByb2dyYW0KJyBsaXN0aW5nICh0aGUgdHlwZS1pbiBwYWdlcyBvZiB0aGF0IGlzc3VlKSBhbmQgcHJvb2YtcmVhZAonIGFnYWluc3QgdGhlIHJ1bm5pbmcgZ2FtZSwgb24gMjAyNi0wNi0xMi4KJyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0KCjEwIFJFTSBTTkVFS0lFCjIwIFJFTSBNUyhYKURPUyBDb21wdXRlciBNYWdhemluZQozMCBSRU0gR1ctQmFzaWMgdmVyc2llCjQwIFJFTSBkb29yIEhlcmJ5U29mdAo3MCBSRU0KODAgREVGSU5UIEEtWTogU0NSRUVOIDA6IFdJRFRIIDgwOiBDTFM6IFpPUkU9MDogUkFORE9NSVpFIFRJTUVSOiBERUYgU0VHPSZIMAo5MCBJRiBQRUVLKCZINDQ5KT03ICBUSEVOICBWSURFTz0mSEIwMDAgRUxTRSBWSURFTz0mSEI4MDAKMTAwIERFRiBTRUc9VklERU86IENMUzogRElNIFQoMTUwMDApLFMoMTY4KSxCKDEwKSxEKDgwLDMpCjExMCBMT0NBVEUgIDEsIDE6IFBSSU5UIENIUiQoMjE4KTtTVFJJTkckKDc4LENIUiQoMTk2KSk7Q0hSJCgxOTEpOwoxMjAgTE9DQVRFICAyLCAxOiBQUklOVCBDSFIkKDE3OSk7U1BDKDc4KTtDSFIkKDE3OSk7CjEzMCBMT0NBVEUgIDIsMTc6IFBSSU5UICIqKioqIFNuZWVraWUgKioqKiAgICAgICAgIChjKSBqdWxpICc4OCBieSBIZXJieVNvZnQiOwoxNDAgTE9DQVRFIDIyLCAxOiBQUklOVCBDSFIkKDE3OSk7U1BDKDc4KTtDSFIkKDE3OSk7CjE1MCBMT0NBVEUgMjIsIDY6IFBSSU5UICIxMCBwdW50ZW4gICAgICAtNTAgcHVudGVuICAgIEhpZ2hzY29yZSI7CjE2MCBMT0NBVEUgMjMsIDE6IFBSSU5UIENIUiQoMTc5KTtTUEMoNzgpO0NIUiQoMTc5KTsKMTcwIExPQ0FURSAyMiw1NTogUFJJTlQgIkxldmVsICAgICAgIFNjb3JlIjsKMTgwIExPQ0FURSAyMywgNjogUFJJTlQgIjI1IHB1bnRlbiAgICAgIFN0ZWVuICAgICAgICAgPEVTQz4gdmFzdGdlbG9wZW4iOwoxOTAgTE9DQVRFIDIzLDU1OiBQUklOVCAiTGl2ZXMgICAgICAgQm9udXMiOwoyMDAgTE9DQVRFIDI0LCAxOiBQUklOVCBDSFIkKDE5Mik7U1RSSU5HJCg3OCxDSFIkKDE5NikpO0NIUiQoMjE3KTsKMjEwIFBPS0UgMzM5NiwxOiBQT0tFIDM1NTYsMTA6IFBPS0UgMzUyNiw1OiBQT0tFIDMzNjYsMwoyMjAgJwoyMzAgWkNPUkU9MDogTElWRT0zCjI0MCBGT1IgTEVWRUw9MSAgVE8gIDMyCjI1MCAgICBGT1IgST0xICBUTyAgMTc6IExPQ0FURSAzK0ksMTogUFJJTlQgQ0hSJCgxNzkpO1NQQyg3OCk7Q0hSJCgxNzkpOiBORVhUCjI2MCAgICBMT0NBVEUgIDMsMTogUFJJTlQgQ0hSJCgxOTUpO1NUUklORyQoNzgsQ0hSJCgxOTYpKTtDSFIkKDE4MCkKMjcwICAgIExPQ0FURSAyMSwxOiBQUklOVCBDSFIkKDE5NSk7U1RSSU5HJCg3OCxDSFIkKDE5NikpO0NIUiQoMTgwKQoyODAgICAgVCgxKT0yMDAwOiBUKDIpPTE4NDA6IEJURUw9MjogRVRFTD0xCjI5MCAgICBQT0tFIFQoQlRFTCksMjE5OiBQT0tFIFQoRVRFTCksMTg2OiBQT0tFIFQoQlRFTCkrMSwxNQozMDAgICAgRT03MjogRj03MjogSEFSVD0wOiBLTEFWRVI9MDogQk9OVVM9MTAwMDA6IE9QPTA6IEdPU1VCIDExOTAKMzEwICAgIE9OIExFVkVMIEdPU1VCIDIzMjAsMjMzMCwyMzQwLDIzNTAsMjM2MCwyMzcwLDIzODAsMjM5MCwyNDEwLDI0MjAsMjQzMCwyNDQwLDI0NTAsMjQ2MCwyNDcwLDI0ODAsMjMyMCwyMzMwLDIzNDAsMjM1MCwyMzYwLDIzNzAsMjM4MCwyMzkwLDI0MTAsMjQyMCwyNDMwLDI0NDAsMjQ1MCwyNDYwLDI0NzAsMjQ4MAozMjAgICAgTE9DQVRFIDIzLDczOiBQUklOVCBVU0lORyAiIyMjIyMjIjtCT05VUwozMzAgICAgTE9DQVRFIDIzLDYxOiBQUklOVCBVU0lORyAiIyMiO0xJVkU6IExPQ0FURSAyMiw2MTogUFJJTlQgVVNJTkcgIiMjIjtMRVZFTAozNDAgICAgRk9SIEk9MSAgVE8gIEFBTlRBTAozNTAgICAgICAgTD0xOiBHT1NVQiAxMTUwOiBMPTM6IEdPU1VCIDExNTA6IElGIEsxPTEgIFRIRU4gIEhBUlQ9SEFSVCsxCjM2MCAgICBORVhUCjM3MCAgICBGT1IgST0xICBUTyAgNDI6IEZPUiBJMz0wICBUTyAgMzogUyhJK0kzKjQyKT1QRUVLKDE0OTcrSStJMyoxNjApOiBORVhUOiBORVhUCjM4MCAgICBHT1NVQiAyMjgwOiBMT0NBVEUgMTEsMzc6IFBSSU5UICJMZXZlbCAiO0xFVkVMCjM5MCAgICBMT0NBVEUgMTIsMzI6IFBSSU5UICJEcnVrIG9wIGVlbiB0b2V0cyIKNDAwICAgIERFRiBTRUc9MDogUE9LRSAxMDUwLFBFRUsoMTA1Mik6IERFRiBTRUc9VklERU86IEEkPUlOUFVUJCgxKQo0MTAgICAgRk9SIEk9MSAgVE8gIDQyOiBGT1IgSTM9MCAgVE8gIDM6IFBPS0UgMTQ5NytJK0kzKjE2MCxTKEkrSTMqNDIpOiBORVhUOiBORVhUCjQyMCAgICBXSElMRSsgS0xBVkVSK0hBUlQ+MAo0MzAgICAgICAgQSQ9SU5LRVkkOiBaMj0wOiBaMT1USU1FUgo0NDAgICAgICAgV0hJTEUrIEEkPSIiICBBTkQgIFoyPFoKNDUwICAgICAgICAgIFoyPVRJTUVSLVoxOiBBJD1JTktFWSQKNDYwICAgICAgIFdFTkQKNDcwICAgICAgIElGIEJPTlVTPjAgIFRIRU4gIEJPTlVTPUJPTlVTLUJNSU4KNDgwICAgICAgIExPQ0FURSAyMyw3MzogUFJJTlQgVVNJTkcgIiMjIyMjIyI7Qk9OVVMKNDkwICAgICAgIElGIExFTihBJCk8PjEgIFRIRU4gIEdPVE8gNjQwCjUwMCAgICAgICAgICBJRiBBU0MoQSQpPD4yNyAgVEhFTiAgR09UTyA5MTAKNTEwICAgICAgICAgIEZPUiBJPTEgIFRPICAzCjUyMCAgICAgICAgICAgICBTT1VORCAyMDAwLDM6IFNPVU5EIDMwMDAsMzogU09VTkQgNDAwMCwzOiBTT1VORCAzMDAwLDMKNTMwICAgICAgICAgIE5FWFQKNTQwICAgICAgICAgIElGIFBMQVkoMCk8PjAgIFRIRU4gIEdPVE8gNTQwCjU1MCAgICAgICAgICBXSElMRSsgRVRFTDw9QlRFTAo1NjAgICAgICAgICAgICAgWj1USU1FUgo1NzAgICAgICAgICAgICAgWjE9VElNRVItWjogSUYgWjE8MC4wNzUgIFRIRU4gIEdPVE8gNTcwCjU4MCAgICAgICAgICAgICBQT0tFIFQoRVRFTCksMzI6IFBPS0UgVChFVEVMKSsxLDc6IFNPVU5EIDE1MDAsMC4xCjU5MCAgICAgICAgICAgICBFVEVMPUVURUwrMTogT1A9Qk1JTiotMTogR09TVUIgMTE5MAo2MDAgICAgICAgICAgV0VORAo2MTAgICAgICAgICAgTElWRT1MSVZFLTE6IEhBUlQ9MDogS0xBVkVSPTAKNjIwICAgICAgICAgIElGIExJVkU9MCAgVEhFTiAgTEVWRUw9MzIgRUxTRSBMRVZFTD1MRVZFTC0xCjYzMCAgICAgICAgICBHT1RPIDEwODAKNjQwICAgICAgIElGIExFTihBJCk9MiAgVEhFTiAgRT1BU0MoTUlEJChBJCwyLDEpKQo2NTAgICAgICAgQT1UKEJURUwpCjY2MCAgICAgICBJRiBFPTY4ICBUSEVOICBHT1RPIDEwODAKNjcwICAgICAgIElGIEU9NjcgIFRIRU4gIExJVkU9TElWRSsxOiBHT1RPIDEwODAKNjgwICAgICAgIElGIEU9ODAgIFRIRU4gIEE9QSsxNjAgRUxTRSBJRiBFPTcyICBUSEVOICBBPUEtMTYwCjY5MCAgICAgICBJRiBFPTc3ICBUSEVOICBBPUErMiAgIEVMU0UgSUYgRT03NSAgVEhFTiAgQT1BLTIKNzAwICAgICAgIEQ9UEVFSyhBKQo3MTAgICAgICAgSUYgRDw+MzIgIFRIRU4gIEdPVE8gNzQwCjcyMCAgICAgICAgICBQT0tFIFQoRVRFTCksMzI6IFBPS0UgVChFVEVMKSsxLDc6IFNPVU5EIDE1MDAsMC4xOiBFVEVMPUVURUwrMQo3MzAgICAgICAgICAgR09UTyA5MjAKNzQwICAgICAgIElGIEQ8PjUgIFRIRU4gIEdPVE8gNzcwCjc1MCAgICAgICAgICBMPTE6IEdPU1VCIDExNTA6IEdPU1VCIDIyNjAKNzYwICAgICAgICAgIE9QPTI1OiBHT1NVQiAxMTkwOiBLTEFWRVI9S0xBVkVSLTE6IEdPVE8gOTIwCjc3MCAgICAgICBJRiBEPD4zICBUSEVOICBHT1RPIDgwMAo3ODAgICAgICAgICAgSUYgTEVWRUw+MTYgIFRIRU4gIEw9NTogR09TVUIgMTE1MDogSUYgSzE9MSAgVEhFTiAgS0xBVkVSPUtMQVZFUisxCjc5MCAgICAgICAgICBMPTE6IEdPU1VCIDExNTA6IEdPU1VCIDIyNjA6IE9QPTEwOiBHT1NVQiAxMTkwOiBIQVJUPUhBUlQtMTogR09UTyA5MjAKODAwICAgICAgIElGIEQ8PjEwICBUSEVOICBHT1RPIDg3MAo4MTAgICAgICAgICAgVEE9QTogSUYgRT04MCAgVEhFTiAgVEE9VEErMTYwIEVMU0UgSUYgRT03MiAgVEhFTiAgVEE9VEEtMTYwCjgyMCAgICAgICAgICBJRiBFPTc3ICBUSEVOICBUQT1UQSsyIEVMU0UgSUYgRT03NSAgVEhFTiAgVEE9VEEtMgo4MzAgICAgICAgICAgRD1QRUVLKFRBKQo4NDAgICAgICAgICAgSUYgRDw+MzIgIFRIRU4gIEdPVE8gOTEwCjg1MCAgICAgICAgICAgICBQT0tFIFRBLDEwOiBQT0tFIFQoRVRFTCksMzI6IFBPS0UgVChFVEVMKSsxLDcKODYwICAgICAgICAgICAgIFNPVU5EIDE1MDAsMC4xOiBFVEVMPUVURUwrMTogR09UTyA5MjAKODcwICAgICAgIElGIEQ8PjEgIFRIRU4gIEdPVE8gOTAwCjg4MCAgICAgICAgICBGT1IgST01MCAgVE8gIDEgIFNURVAgIC0xOiBTT1VORCA2MDArNzUqSSwwLjM1OiBORVhUCjg5MCAgICAgICAgICBPUD0tNTA6IEdPU1VCIDExOTA6IEw9MTogR09TVUIgMTE1MDogR09UTyA5MjAKOTAwICAgICAgIElGIEQ9MjQgIE9SICBEPTI2ICBPUiAgRD0yNyAgVEhFTiAgR09UTyA1MTAKOTEwICAgICAgIEU9RjogT1A9Qk1JTiotMTogR09TVUIgMTE5MDogU09VTkQgMTAwMCw1OiBHT1RPIDEwMjAKOTIwICAgICAgIElGIChFPTc3ICBBTkQgIEY9NzcpICBPUiAgKEU9NzUgIEFORCAgRj03NSkgIFRIRU4gIFBPS0UgVChCVEVMKSwyMDU6IEdPVE8gOTgwCjkzMCAgICAgICBJRiAoRT04MCAgQU5EICBGPTgwKSAgT1IgIChFPTcyICBBTkQgIEY9NzIpICBUSEVOICBQT0tFIFQoQlRFTCksMTg2OiBHT1RPIDk4MAo5NDAgICAgICBJRiAoRT04MCAgQU5EICBGPTc3KSAgT1IgIChFPTc1ICBBTkQgIEY9NzIpICBUSEVOICBQT0tFIFQoQlRFTCksMTg3OiBHT1RPIDk4MAo5NTAgICAgICBJRiAoRT03MiAgQU5EICBGPTc3KSAgT1IgIChFPTc1ICBBTkQgIEY9ODApICBUSEVOICBQT0tFIFQoQlRFTCksMTg4OiBHT1RPIDk4MAo5NjAgICAgICBJRiAoRT04MCAgQU5EICBGPTc1KSAgT1IgIChFPTc3ICBBTkQgIEY9NzIpICBUSEVOICBQT0tFIFQoQlRFTCksMjAxOiBHT1RPIDk4MAo5NzAgICAgICBJRiAoRT03MiAgQU5EICBGPTc1KSAgT1IgIChFPTc3ICBBTkQgIEY9ODApICBUSEVOICBQT0tFIFQoQlRFTCksMjAwOiBHT1RPIDk4MAo5ODAgICAgICBCVEVMPUJURUwrMTogVChCVEVMKT1BOiBGPUU6IFBPS0UgVChCVEVMKSwyMTkKOTkwICAgICAgSUYgQlRFTD0xNTAwMCAgVEhFTiAgR09UTyA1MTAKMTAwMCAgICAgIEZPUiBJPUJURUwgIFRPICBFVEVMICBTVEVQICAtMjogUE9LRSBUKEkpKzEsMTU6IFBPS0UgVChJLTEpKzEsNzogTkVYVAoxMDEwICAgICAgT04gTEVWRUwgR09TVUIgMTE3MCwxMTcwLDExNzAsMTE3MCwyMTMwLDE4MzAsMTk3MCwyMTMwLDExNzAsMTE3MCwxMTcwLDExNzAsMjEzMCwxODMwLDE5NzAsMjEzMCwxMTcwLDExNzAsMTE3MCwxMTcwLDIxMzAsMTgzMCwxOTcwLDIxMzAsMTE3MCwxMTcwLDExNzAsMTE3MCwyMTMwLDE4MzAsMTk3MCwyMTMwCjEwMjAgICBXRU5ECjEwMzAgICBXSElMRSsgQk9OVVM+MAoxMDQwICAgICAgT1A9NTogR09TVUIgMTE5MDogQk9OVVM9Qk9OVVMtNTogTE9DQVRFIDIzLDc0CjEwNTAgICAgICBQUklOVCBVU0lORyAiIyMjIyMiO0JPTlVTOiBTT1VORCAzMDAwLDAuMQoxMDYwICAgV0VORAoxMDcwICAgTElWRT1MSVZFKzEKMTA4MCBORVhUIExFVkVMCjEwOTAgR09TVUIgMjI4MDogTE9DQVRFIDExLDMzOiBQUklOVCAiRWluZGUiCjExMDAgTE9DQVRFIDEyLDMyOiBQUklOVCAiTm9nIGVlbiBrZWVyIChqL24pIgoxMTEwIERFRiBTRUc9MDogUE9LRSAxMDUwLFBFRUsoMTA1Mik6IERFRiBTRUc9VklERU8KMTEyMCBBJD1JTlBVVCQoMSk6IElGIElOU1RSKCJKak5uIixBJCk9MCAgVEhFTiAgR09UTyAxMTIwCjExMzAgSUYgQSQ9IkoiICBPUiAgQSQ9ImoiICBUSEVOICBHT1RPIDIzMCBFTFNFIENMUzogUFJJTlQgIkJlZGFua3Qgdm9vciBoZXQgc3BlbGVuIjogRU5ECjExNDAgJwoxMTUwIEsxPTA6IEs9SU5UKFJORCoyNzIwKzQ4MCk6IElGIEsgIE1PRCAgMj0xICBUSEVOICBLPUsrMQoxMTYwIElGIFBFRUsoSyk9MzIgIFRIRU4gIFBPS0UgSyxMOiBLMT0xCjExNzAgUkVUVVJOCjExODAgJwoxMTkwIFpDT1JFPVpDT1JFK09QOiBMT0NBVEUgMjIsNzM6IFBSSU5UIFVTSU5HICIjIyMjIyMiO1pDT1JFCjEyMDAgSUYgWkNPUkU+Wk9SRSAgVEhFTiAgWk9SRT1aQ09SRTogTE9DQVRFIDIyLDQ2OiBQUklOVCBVU0lORyAiIyMjIyMjIjtaT1JFCjEyMTAgUkVUVVJOCjEyMjAgJwoxMjMwIEZPUiBJPTEgIFRPICAzOTogTE9DQVRFIDgsMStJOiBQUklOVCBDSFIkKDE5Nik6IExPQ0FURSAxNiw4MC1JOiBQUklOVCBDSFIkKDE5Nik6IE5FWFQKMTI0MCAgRk9SIEk9MCAgVE8gIDgKMTI1MCAgIExPQ0FURSAyMS1JLDExOiBQUklOVCBDSFIkKDE3OSk6IExPQ0FURSAzK0ksNzA6IFBSSU5UIENIUiQoMTc5KTogTE9DQVRFIDIxLUksMjY6IFBSSU5UIENIUiQoMTc5KQoxMjYwICAgTE9DQVRFIDMrSSw1NTogUFJJTlQgQ0hSJCgxNzkpOiBMT0NBVEUgMTUsMjIrSTogUFJJTlQgQ0hSJCgxOTYpOiBMT0NBVEUgNiw1MStJOiBQUklOVCBDSFIkKDE5NikKMTI3MCAgIExPQ0FURSAxNSw3K0k6IFBSSU5UIENIUiQoMTk2KTogTE9DQVRFIDYsNjYrSTogUFJJTlQgQ0hSJCgxOTYpOiBMT0NBVEUgMTgsNytJOiBQUklOVCBDSFIkKDE5NikKMTI4MCAgIExPQ0FURSA5LDY2K0k6IFBSSU5UIENIUiQoMTk2KTogTE9DQVRFIDE4LDIyK0k6IFBSSU5UIENIUiQoMTk2KTogTE9DQVRFIDksNTErSTogUFJJTlQgQ0hSJCgxOTYpCjEyOTAgICBGT1IgSTE9NiAgVE8gIDEwCjEzMDAgICAgIExPQ0FURSBJMSw1K0kqNDogUFJJTlQgQ0hSJCgxNzkpOiBMT0NBVEUgOCtJMSw0NCtJKjQ6IFBSSU5UIENIUiQoMTc5KQoxMzEwICAgTkVYVAoxMzIwICAgTE9DQVRFIDgsNStJKjQ6IFBSSU5UIENIUiQoMTk3KTogTE9DQVRFIDE2LDQ0K0kqNDogUFJJTlQgQ0hSJCgxOTcpCjEzMzAgTkVYVAoxMzQwIExPQ0FURSAgMyw3MDogUFJJTlQgQ0hSJCgxOTQpOiBMT0NBVEUgMjEsMTE6IFBSSU5UIENIUiQoMTkzKTogTE9DQVRFICAzLDU1OiBQUklOVCBDSFIkKDE5NCkKMTM1MCBMT0NBVEUgMTUsMjY6IFBSSU5UIENIUiQoMTk3KTogTE9DQVRFICA2LDU1OiBQUklOVCBDSFIkKDE5Nyk6IExPQ0FURSAxOCwyNjogUFJJTlQgQ0hSJCgxOTcpCjEzNjAgTE9DQVRFICA5LDU1OiBQUklOVCBDSFIkKDE5Nyk6IExPQ0FURSAxNSwxMTogUFJJTlQgQ0hSJCgxOTcpOiBMT0NBVEUgIDYsNzA6IFBSSU5UIENIUiQoMTk3KQoxMzcwIExPQ0FURSAxOCwxMTogUFJJTlQgQ0hSJCgxOTcpOiBMT0NBVEUgIDksNzA6IFBSSU5UIENIUiQoMTk3KTogTE9DQVRFIDIxLDI2OiBQUklOVCBDSFIkKDE5MykKMTM4MCBSRVRVUk4KMTM5MCAnCjE0MDAgRk9SIFk9NCAgVE8gIDIwICBTVEVQICAyOiBGT1IgST0wICBUTyAgMTogUT0xOiBGT1IgQT0xICBUTyAgNgoxNDEwICAgIElGIFE9MSAgVEhFTiAgUT0wOiBZPVkrMSBFTFNFIFE9MTogWT1ZLTEKMTQyMCAgICBJRiBZPDIxICBUSEVOICBYPTE3K0ErNDAqSTogR09TVUIgMTQ4MAoxNDMwICAgIE5FWFQ6IE5FWFQ6IE5FWFQKMTQ0MCAgICBJMT03CjE0NTAgICAgRk9SIFg9MiAgVE8gIDc4ICBTVEVQICAyOiBGT1IgST0wICBUTyAgMQoxNDYwICAgICAgIFk9Nys4Kkk6IEdPU1VCIDE0ODA6IFk9OCs4Kkk6IFg9WCsxOiBHT1NVQiAxNDgwOiBZPTkrOCpJOiBYPVgtMTogR09TVUIgMTQ4MAoxNDcwIE5FWFQ6IE5FWFQ6IFJFVFVSTgoxNDgwIFBPS0UgKFktMSkqMTYwKyhYLTEpKjIsMTA6IFJFVFVSTgoxNDkwICcKMTUwMCBGT1IgST0yICBUTyAgNzk6IEZPUiBJMT0xICBUTyAgMjogTE9DQVRFIDMrNipJMSxJOiBQUklOVCBDSFIkKDE5Nik6IE5FWFQ6IE5FWFQKMTUxMCAgICBGT1IgST00ICBUTyAgMjA6IEZPUiBJMT0xICBUTyAgNwoxNTIwICAgICAgIExPQ0FURSAgMywxMCpJMTogUFJJTlQgQ0hSJCgxOTQpOiBMT0NBVEUgMjEsMTAqSTE6IFBSSU5UIENIUiQoMTkzKQoxNTMwICAgICAgIExPQ0FURSBJLDEwKkkxOiBQUklOVCBDSFIkKDE3OSkKMTU0MCAgICAgICBGT1IgSTI9MSAgVE8gIDIKMTU1MCAgICAgICAgICBMT0NBVEUgMys2KkkyLDEwKkkxOiBQUklOVCBDSFIkKDE5Nyk6IExPQ0FURSAzKzYqSTIsODA6IFBSSU5UIENIUiQoMTgwKQoxNTYwICAgICAgICAgIExPQ0FURSAzKzYqSTIsIDE6IFBSSU5UIENIUiQoMTk1KQoxNTcwIE5FWFQ6IE5FWFQ6IE5FWFQ6IFJFU1RPUkUgMTUwMAoxNTgwIEZPUiBJPTEgIFRPICAxMzogUkVBRCBDMSxDMixDMyxDNAoxNTkwICAgIExPQ0FURSBDMSxDMjogUFJJTlQgIiAiOiBMT0NBVEUgQzEsQzItMTogUFJJTlQgQ0hSJCgxODApCjE2MDAgICAgTE9DQVRFIEMxLEMyKzI6IFBSSU5UIENIUiQoMTk1KTogTE9DQVRFIEMxLEMyKzE6IFBSSU5UICIgIgoxNjEwICAgIExPQ0FURSBDMysyLEM0OiBQUklOVCBDSFIkKDE5NCk6IExPQ0FURSBDMysxLEM0OiBQUklOVCAiICIKMTYyMCAgICBMT0NBVEUgQzMsQzQ6IFBSSU5UICIgIjogTE9DQVRFIEMzLTEsQzQ6IFBSSU5UIENIUiQoMTkzKQoxNjMwIE5FWFQ6IFJFVFVSTjogREFUQSAxNSw1CjE2NDAgREFUQSA2LDEwLDksMzUsNiwyMCw5LDc1LDYsNDAsOSw1NSw2LDcwLDksNjUsMTgsMTAsMTUsNTUsMTgsMjAsMTUsNjUsMTgsMzAKMTY1MCBEQVRBIDE1LDc1LDE4LDQwLDksNDUsMTIsMjAsOSwxNSwxMiwzMCw5LDE1LDE4LDUwLDksMTUsNiw1MCw5LDE1LDE4LDYwCjE2NjAgJwoxNjcwIEZPUiBJPTEgIFRPICA5OiBCKEkpPTYrSQoxNjgwICAgIExPQ0FURSAgMyw4Kkk6IFBSSU5UIENIUiQoMTk0KQoxNjkwICAgIEZPUiBJMT00ICBUTyAgMjA6IExPQ0FURSBJMSw4Kkk6IFBSSU5UIENIUiQoMTc5KTogTkVYVAoxNzAwICAgIExPQ0FURSAyMSw4Kkk6IFBSSU5UIENIUiQoMTkzKTogTE9DQVRFIEIoSSktMSxJKjg6IFBSSU5UICLilLQKMTcxMCAgICAgICBGT1IgSTE9MCAgVE8gIDI6IExPQ0FURSBCKEkpK0kxLEkqODogUFJJTlQgIiAiOiBORVhUCjE3MjAgICAgICAgTE9DQVRFIEIoSSkrMyxJKjg6IFBSSU5UIENIUiQoMTk0KQoxNzMwIE5FWFQ6IFJFVFVSTgoxNzQwICcKMTc1MCBHT1NVQiAxNjcwCjE3NjAgRk9SIEkxPTQgIFRPICAyMCAgU1RFUCAgMjogRk9SIEkyPTAgIFRPICA5CjE3NzAgICAgWT1JMTogWD1JMio4KzM6IEdPU1VCIDE0ODA6IFk9STE6IFg9STIqOCs1OiBHT1NVQiAxNDgwCjE3ODAgICAgSUYgWTwyMCAgVEhFTiAgWT1JMSsxOiBYPUkyKjgrNDogR09TVUIgMTQ4MAoxNzkwIE5FWFQ6IE5FWFQ6IFJFVFVSTgoxODAwICcKMTgxMCBGT1IgST0yICBUTyAgNzkgIFNURVAgIDI6IEQoSSwxKT01K0lOVChSTkQqMTQpOiBEKEksMik9MzI6IE5FWFQ6IEdPU1VCIDE4MzA6IFJFVFVSTgoxODIwICcKMTgzMCBGT1IgST0yICBUTyAgNzggIFNURVAgIDIKMTg0MCAgICBJMj0oRChJLDEpLTEpKjE2MCsoSS0xKSoyCjE4NTAgICAgSUYgRChJLDEpPTQgIFRIRU4gIFBPS0UgSTIsRChJLDIpOiBQT0tFIEkyKzEsNzogRChJLDEpPTIxOiBJMj1JMisyNzIwCjE4NjAgICAgSUYgUEVFSyhJMi0xNjApPTIxOSAgVEhFTiAgUkVUVVJOIDUxMAoxODcwICAgIElGIFBFRUsoSTItMTYwKT4xMDAgIFRIRU4gIEdPVE8gMTkwMAoxODgwICAgICAgIElGIEQoSSwxKTw+MjEgIFRIRU4gIFBPS0UgSTIsRChJLDIpOiBQT0tFIEkyKzEsNwoxODkwICAgICAgIEQoSSwxKT1EKEksMSktMTogRChJLDIpPVBFRUsoSTItMTYwKTogUE9LRSBJMi0xNjAsMjQ6IFBPS0UgSTItMTU5LDE1CjE5MDAgTkVYVDogUkVUVVJOCjE5MTAgJwoxOTIwIEZPUiBJPTQgIFRPICAyMDogRk9SIEE9MCAgVE8gIDEKMTkzMCAgICBEKEkrQSoyMCwxKT1STkQqMzgqMisyK0E6IEQoSStBKjIwLDIpPTMyCjE5NDAgTkVYVDogTkVYVAoxOTUwIEQoMTIsMSk9MTQ6IEQoMTMsMSk9NjogRCgzMiwxKT02NTogRCgzMywxKT01NTogR09TVUIgMTk3MDogUkVUVVJOCjE5NjAgJwoxOTcwIEZPUiBJPTQgIFRPICAyMAoxOTgwICAgIEkyPShJLTEpKjE2MCsoRChJLDEpLTEpKjIKMTk5MCAgICBJRiBEKEksMSk9NzkgIFRIRU4gIFBPS0UgSTIsRChJLDIpOiBQT0tFIEkyKzEsNzogRChJLDEpPTE6IEkyPUkyLTE1NgoyMDAwICAgIEQ9UEVFSyhJMisyKTogSUYgRD0yMTkgIFRIRU4gIFJFVFVSTiA1MTAKMjAxMCAgICBJRiBEPTI3ICBUSEVOICBQT0tFIEkyKzIsRChJKzIwLDIpOiBEKEkrMjAsMik9MjYKMjAyMCAgICBJRiBEPjEwMCAgVEhFTiAgR09UTyAyMDUwCjIwMzAgICAgICAgSUYgRChJLDEpPD4xICBUSEVOICBQT0tFIEkyLEQoSSwyKTogUE9LRSBJMisxLDcKMjA0MCAgICAgICBEKEksMSk9RChJLDEpKzE6IEQoSSwyKT1QRUVLKEkyKzIpOiBQT0tFIEkyKzIsMjY6IFBPS0UgSTIrMywxNQoyMDUwICAgIEw9SSsyMDogSTI9KEktMSkqMTYwKyhEKEwsMSktMSkqMgoyMDYwICAgIElGIEQoTCwxKT0yICBUSEVOICBQT0tFIEkyLEQoTCwyKTogUE9LRSBJMisxLDc6IEQoTCwxKT04MDogSTI9STIrMTU2CjIwNzAgICAgRD1QRUVLKEkyLTIpOiBJRiBEPTIxOSAgVEhFTiAgUkVUVVJOIDUxMAoyMDgwICAgIElGIEQ+MTAwICBPUiAgRD0yNiAgVEhFTiAgR09UTyAyMTEwCjIwOTAgICAgICAgSUYgRChMLDEpPD44MCAgVEhFTiAgUE9LRSBJMixEKEwsMik6IFBPS0UgSTIrMSw3CjIxMDAgICAgICAgRChMLDEpPUQoTCwxKS0xOiBEKEwsMik9UEVFSyhJMi0yKTogUE9LRSBJMi0yLDI3OiBQT0tFIEkyLTEsMTUKMjExMCBORVhUOiBSRVRVUk4KMjEyMCAnCjIxMzAgRk9SIEQxPTEgIFRPICA5CjIxNDAgICAgRDI9KEIoRDEpLTEpKjE2MCsoRDEqOC0xKSoyOiBJRiBCKEQxKTw+NCAgVEhFTiAgR09UTyAyMTkwCjIxNTAgICAgQT1QRUVLKEQyKzIwODApK1BFRUsoRDIrMjI0MCkrUEVFSyhEMisyNDAwKQoyMTYwICAgIElGIEE8Pjk2ICBUSEVOICBHT1RPIDIyNDAKMjE3MCAgICBQT0tFIEQyKzI1NjAsMTc5OiBQT0tFIEQyKzIwODAsMTc5OiBQT0tFIEQyKzIyNDAsMTc5OiBQT0tFIEQyKzI0MDAsMTc5CjIxODAgICAgUE9LRSBEMiwzMjogUE9LRSBEMisxNjAsMzI6IFBPS0UgRDIrMzIwLDMyOiBQT0tFIEQyKzE5MjAsMTc5CjIxOTAgICAgQT1QRUVLKEQyKStQRUVLKEQyKzE2MCkrUEVFSyhEMiszMjApCjIyMDAgICAgSUYgQTw+OTYgIFRIRU4gIEdPVE8gMjI0MAoyMjEwICAgICAgIElGIEIoRDEpPD40ICBUSEVOICBQT0tFIEQyLTE2MCwxNzkKMjIyMCAgICAgICBQT0tFIEQyLDE5MzogUE9LRSBEMisxNjAsMzI6IFBPS0UgRDIrMzIwLDMyOiBQT0tFIEQyKzQ4MCwzMgoyMjMwICAgICAgIFBPS0UgRDIrNjQwLDE5NDogQihEMSk9QihEMSkrMTogSUYgQihEMSk9MTcgIFRIRU4gIEIoRDEpPTQKMjI0MCBORVhUOiBSRVRVUk4KMjI1MCAnCjIyNjAgUExBWSAibWIiOiBTT1VORCAyNTAwLDAuMTogU09VTkQgMzUwMCwwLjE6IFNPVU5EIDUwMDAsMC4xOiBSRVRVUk4KMjI3MCAnCjIyODAgTE9DQVRFIDEwLDMwOiBQUklOVCBDSFIkKDIwMSk7U1RSSU5HJCgxOSxDSFIkKDIwNSkpO0NIUiQoMTg3KQoyMjkwIExPQ0FURSAxMSwzMDogUFJJTlQgQ0hSJCgxODYpO1NQQygxOSk7Q0hSJCgxODYpOiBMT0NBVEUgMTIsMzA6IFBSSU5UIENIUiQoMTg2KTtTUEMoMTkpO0NIUiQoMTg2KQoyMzAwIExPQ0FURSAxMywzMDogUFJJTlQgQ0hSJCgyMDApO1NUUklORyQoMTksQ0hSJCgyMDUpKTtDSFIkKDE4OCk6IFJFVFVSTgoyMzEwICcKMjMyMCBaPTk5OTogQUFOVEFMPSA3NTogQk1JTj0xMDogUkVUVVJOCjIzMzAgWj05OTk6IEFBTlRBTD0gNzU6IEJNSU49MTA6IEdPU1VCIDEyMzA6IFJFVFVSTgoyMzQwIFo9OTk5OiBBQU5UQUw9IDc1OiBCTUlOPTEwOiBHT1NVQiAxNTAwOiBSRVRVUk4KMjM1MCBaPTk5OTogQUFOVEFMPSA1MDogQk1JTj0xMDogR09TVUIgMTQwMDogUkVUVVJOCjIzNjAgWj05OTk6IEFBTlRBTD0gNTA6IEJNSU49MTA6IEdPU1VCIDE2NzA6IFJFVFVSTgoyMzcwIFo9OTk5OiBBQU5UQUw9IDUwOiBCTUlOPTEwOiBHT1NVQiAxODEwOiBSRVRVUk4KMjM4MCBaPTk5OTogQUFOVEFMPSA1MDogQk1JTj0xMDogR09TVUIgMTkyMDogUkVUVVJOCjIzOTAgWj05OTk6IEFBTlRBTD0gNTA6IEJNSU49MTA6IEdPU1VCIDE3NTA6IFJFVFVSTgoyNDAwICcKMjQxMCBaPSAwLjQ6IEFBTlRBTD0xMjU6IEJNSU49IDU6IFJFVFVSTgoyNDIwIFo9IDAuNjogQUFOVEFMPTEyNTogQk1JTj0gNTogR09TVUIgMTIzMDogUkVUVVJOCjI0MzAgWj0gMC42OiBBQU5UQUw9MTI1OiBCTUlOPSA1OiBHT1NVQiAxNTAwOiBSRVRVUk4KMjQ0MCBaPSAwLjk6IEFBTlRBTD0xMDA6IEJNSU49IDU6IEdPU1VCIDE0MDA6IFJFVFVSTgoyNDUwIFo9IDAuOTogQUFOVEFMPTEwMDogQk1JTj0gNTogR09TVUIgMTY3MDogUkVUVVJOCjI0NjAgWj0xICA6IEFBTlRBTD0xMDA6IEJNSU49IDU6IEdPU1VCIDE4MTA6IFJFVFVSTgoyNDcwIFo9MSAgOiBBQU5UQUw9MTAwOiBCTUlOPSA1OiBHT1NVQiAxOTIwOiBSRVRVUk4KMjQ4MCBaPTEuMjogQUFOVEFMPTEwMDogQk1JTj0gNTogR09TVUIgMTc1MDogUkVUVVJOCg=="), c => c.charCodeAt(0)));

function lineNo(line){ const m = /^\s*(\d+)/.exec(line); return m ? +m[1] : null; }

/* ---------- section cards (inserted before the given BASIC line) ---------- */
const SECTIONS = [
  {at:80, t:'Boot &amp; find the screen', h:`Three jobs in two lines. <code>DEFINT A-Y</code> makes every variable A&hellip;Y an integer &mdash; which deliberately leaves the <code>Z*</code> names floating-point, the reason the timer and score are called <code>Z</code>, <code>ZCORE</code>, <code>ZORE</code>. <code>SCREEN 0:WIDTH 80</code> selects 80&times;25 text. Then <code>PEEK(&amp;H449)</code> asks the BIOS whether this PC has a mono card (memory at <code>&amp;HB000</code>) or colour (<code>&amp;HB800</code>); from here on every <code>PEEK</code>/<code>POKE</code> aims straight at that screen memory.`},
  {at:110, t:'Paint the frame &amp; score panel', h:`Plain <code>LOCATE&hellip;PRINT</code> draws the fixed furniture: the outer box, the title bar, and the legend along the bottom. The final line <code>POKE</code>s the four little legend icons (&#9786; &#9689; &#9827; &#9829;) straight into screen memory at fixed offsets.`},
  {at:230, t:'Start a new game', h:`Zero the score and set three lives, then play levels 1&rarr;32.`},
  {at:240, t:'The level loop', h:`For each level: blank the 17 inner rows, drop a two-cell snake in the middle pointing up, and <code>ON LEVEL GOSUB</code> into this level's recipe (lines 2320&ndash;2480) which sets the speed and builds the maze.`},
  {at:320, t:'Status line &amp; scattering the items', h:`Show the bonus, lives and level, then sprinkle <code>AANTAL</code> hearts and <code>AANTAL</code> smileys onto random empty squares. <code>HART</code> ends up holding how many hearts you must collect to clear the level.`},
  {at:370, t:'The &ldquo;Level n&rdquo; pop-up', h:`Copy the patch of screen the box will cover into <code>S()</code>, draw the box and level number, wait for a key, then paste the screen back &mdash; so the pop-up leaves no hole behind it.`},
  {at:420, t:'The move loop &mdash; reading a key', h:`The heart of the game. It runs until every heart and club is gone, waiting up to <code>Z</code> seconds for a key each tick. On the early levels <code>Z=999</code> (wait forever &mdash; turn-based); later levels give you a fraction of a second, so the snake keeps moving on its own if you don't steer.`},
  {at:470, t:'Spend bonus, then sort the keypress', h:`Every tick nibbles <code>BMIN</code> off the bonus. Then the keypress is classified: a 2-character string is an arrow key (or a time-out) and jumps to the movement code at 640; a single character that is ESC starts the give-up routine; any other single key is treated as a wasted move.`},
  {at:660, t:'Cheats, then turn the head', h:`Two hidden keys first: F10 (scancode 68) skips the level, F9 (67) grants a life and skips. Otherwise the heading is turned into a step across screen memory &mdash; &plusmn;160 for a row, &plusmn;2 for a column &mdash; giving <code>A</code>, the cell the head wants to enter, which is then <code>PEEK</code>ed.`},
  {at:710, t:'What is in the next cell?', h:`The big decision: switch on the character found ahead.
    <ul>
      <li><code>32</code> empty &rarr; slide forward (erase tail, advance).</li>
      <li><code>5</code> &#9827; club &rarr; +25 and <b>grow</b> (the tail is not erased).</li>
      <li><code>3</code> &#9829; heart &rarr; +10 and grow; on levels past 16 it also breeds a new club.</li>
      <li><code>10</code> &#9689; stone &rarr; push it if the square beyond is empty, else you're blocked.</li>
      <li><code>1</code> &#9786; smiley &rarr; &minus;50 and grow onto it.</li>
      <li><code>24/26/27</code> arrow &rarr; instant death.</li>
    </ul>
    A neat twist: eating a heart or club <i>spawns fresh smileys</i>, so the board gets busier as you clear it.`},
  {at:910, t:'Blocked &mdash; walls and your own tail', h:`If the cell ahead is a wall or part of the snake, you simply can't enter: keep the old heading (<code>E=F</code>), lose a little bonus, buzz, and skip the move. Unlike most snake games, walls and bumping yourself don't kill you here &mdash; only arrows, ESC, or completely filling <code>T()</code> do.`},
  {at:920, t:'Lay the body, grow the head, animate', h:`The cell the head is leaving is turned into the correct box-drawing piece &mdash; straight <span class="mono">&#9552;</span>/<span class="mono">&#9553;</span> or a corner <span class="mono">&#9559;&#9565;&#9556;&#9562;</span> chosen from the new heading <code>E</code> and the old one <code>F</code> &mdash; then a new <span class="mono">&#9608;</span> head is appended at <code>T(BTEL)</code>. A "shimmer" lights alternate body cells, and finally this level's animation routine (arrows or gates) takes one step.`},
  {at:1030, t:'Level cleared &mdash; bank the bonus', h:`Pour the leftover bonus into the score, 5 points and a beep at a time, then award an extra life.`},
  {at:1090, t:'The End / play again', h:`After all 32 levels (or when the lives run out) show <i>Einde</i> ("The End"), ask <i>Nog een keer (j/n)</i> ("again? y/n"), and either restart at 230 or quit.`},
  {at:1150, t:'Drop an item on a random cell', h:`Pick a random <i>even</i> offset inside the playfield (even so it lands on a character byte, not its colour byte). If that square is empty, write the item there and set <code>K1=1</code> to report that it landed.`},
  {at:1190, t:'Score &amp; high score', h:`Add <code>OP</code> to the score and redraw it; if it beats <code>ZORE</code>, update and show the high score.`},
  {at:1230, t:'Layout: the labyrinth', h:`Nested loops draw a web of single-line walls joined with <span class="mono">&#9532;</span> junctions &mdash; the densest of the mazes (used by levels 2, 10, 18, 26).`},
  {at:1400, t:'Layout: scattered stones', h:`Lays &#9689; stones in a zig-zag. The four-line helper at <b>1480</b> &mdash; <code>POKE (Y-1)*160+(X-1)*2,&hellip;</code> &mdash; is the shared "put one character at column X, row Y" routine that several layouts call.`},
  {at:1500, t:'Layout: rooms with doorways', h:`Build a grid of little rooms (rails every 6 rows, walls every 10 columns, joined with <span class="mono">&#9532;&#9516;&#9524;&#9500;&#9508;</span>), then <code>READ</code> 13 coordinate pairs from the <code>DATA</code> at 1630&ndash;1650 and knock doorways through the walls at those spots.`},
  {at:1670, t:'Layout: vertical gates', h:`Columns each with a 3-cell gap; <code>B(I)</code> remembers the row of each gap. On the moving-gate levels those gaps later slide (see &sect;&nbsp;the moving gates).`},
  {at:1750, t:'Layout: gates + stones', h:`The gate layout (GOSUB 1670) plus a scatter of stones.`},
  {at:1810, t:'Hazard: upward arrows', h:`Set-up gives each even column a random arrow row in <code>D(I,1)</code> and marks the cell behind it empty in <code>D(I,2)</code>; <code>sub1830</code> then nudges every <span class="mono">&#8593;</span> arrow one row upward each tick, wrapping from row 4 back to row 21. An arrow stepping onto the head (<code>219</code>) is fatal &mdash; <code>RETURN 510</code> jumps into the death routine.`},
  {at:1920, t:'Hazard: horizontal arrows', h:`Two arrows per row &mdash; one travelling right (<span class="mono">&#8594;</span>), one left (<span class="mono">&#8592;</span>) &mdash; advanced each tick by <code>sub1970</code> and wrapped at the far column. Touching the head kills.`},
  {at:2130, t:'Hazard: the moving gates', h:`Each tick the nine gate openings slide. The <code>=96</code> tests (three blank cells sum to 96) check the path is clear before a gap shifts down, and a gap that passes the bottom wraps back to the top.`},
  {at:2260, t:'The pick-up jingle', h:`<code>PLAY "mb"</code> means "music in the background" (don't pause the game) followed by three rising blips.`},
  {at:2280, t:'The pop-up box', h:`Draws the double-line box used behind the "Level n" and "The End" messages.`},
  {at:2320, t:'The 32 level recipes', h:`Each line sets the three dials &mdash; <code>Z</code> (seconds per move), <code>AANTAL</code> (items to scatter), <code>BMIN</code> (bonus drain) &mdash; and calls a layout. 2320&ndash;2390 are the calm, turn-based first eight; 2410&ndash;2480 are the same mazes but real-time and getting faster. The <code>ON LEVEL</code> tables at 310 and 1010 pick one per level and loop the set of 16 for levels 17&ndash;32.`},
];
const SEC_AT = {}; SECTIONS.forEach((s, i) => { s.num = i + 1; SEC_AT[s.at] = s; });

/* ---------- inline notes, keyed by BASIC line number ---------- */
const NOTES = {
  80:'DEFINT A-Y = integers; Z* left floating-point (TIMER needs fractions, the score can pass 32767). SCREEN 0:WIDTH 80 = 80x25 text. RANDOMIZE TIMER seeds the dice.',
  90:'PEEK(&H449) is the BIOS video-mode byte. Mode 7 = mono card at &HB000; anything else = colour at &HB800.',
  100:'DEF SEG=VIDEO aims PEEK/POKE at screen memory. DIM the four arrays: T()=snake, S()=pop-up backup, B()=gate rows, D()=arrows.',
  110:'Top edge of the frame: corner + 78 bars + corner.',
  130:'The title in the top bar.',
  200:'Bottom edge of the frame.',
  210:'Drop the four legend icons straight into screen memory by offset: smiley(1), stone(10), club(5), heart(3).',
  230:'Fresh game: score 0, three lives.',
  250:'Wipe the 17 inner rows back to blank, leaving the side walls.',
  280:'Seed the snake: tail at offset 2000 (row 13), head at 1840 (row 12, right above it) -> it starts pointing up. BTEL=2 is the head slot in T(), ETEL=1 the tail.',
  290:'Paint it: head = block (219), tail = double-bar (186), head attribute bright (15).',
  300:'Per-level reset: heading up (E=F=72), nothing collected yet, bonus 10000.',
  310:"ON LEVEL GOSUB -> this level's recipe (2320..2480): speed, item count, bonus step, and the maze. Levels 17-32 reuse the same 16.",
  340:'Scatter the items: AANTAL times, drop one smiley (hazard) and one heart.',
  350:'GOSUB 1150 drops a char on a random empty cell. K1=1 means the heart landed -> count it into HART.',
  370:'Back up the 4x42 region the pop-up will cover into S() so it can be restored (1497 = box top-left, +160 per row).',
  400:'Flush the BIOS keyboard buffer (head:=tail) so a stray key does not skip the box, then wait for one key.',
  410:'Paste the saved region back, erasing the box.',
  420:'Play this level until every heart AND club is collected (HART+KLAVER reaches 0).',
  430:'Grab whatever key is waiting; start a timer.',
  450:'Keep polling INKEY$ until a key arrives or Z seconds pass. Z=999 early (wait forever, turn-based); a fraction later (the snake moves itself).',
  470:'Each move costs BMIN off the bonus.',
  490:'A real arrow key is a 2-character string, so length<>1 means a move (or a time-out) -> handle at 640.',
  500:'It was a single character. If not ESC (27), it is junk -> 910 (small penalty, no move).',
  510:'ESC (or jumped here from a deadly hit): the you-died / give-up routine.',
  540:'Wait for the sound queue to drain (PLAY(0) = notes still pending).',
  550:'Unwind the whole snake, tail-first...',
  580:'...blank each cell (space + normal attribute) with a blip...',
  590:'...advancing the tail and docking the bonus as it goes.',
  610:'Lose a life; clear the heart/club counters.',
  620:'Last life? set LEVEL=32 so the FOR loop ends (game over). Otherwise LEVEL-1 so NEXT replays this level.',
  640:'A 2-char key: take the scancode from its second byte into E (new heading). A time-out leaves E as-is, so the snake keeps going.',
  650:'A = where the head is now.',
  660:'Scancode 68 = F10: skip to the next level.',
  670:'Scancode 67 = F9: free life and skip.',
  680:'Turn the heading into a screen step: +/-160 = up/down a row, +/-2 = left/right a column. A is now the target cell.',
  700:'Look at what is already in that cell.',
  710:'32 = empty -> just move.',
  720:'Erase the tail cell and advance the tail pointer, so the snake slides forward at the same length.',
  740:'5 = club (worth 25).',
  750:'Drop a fresh smiley somewhere (L=1) and play the jingle -- collecting tightens the screen.',
  760:'+25, one fewer club, finish. No tail erase here, so eating GROWS the snake.',
  770:'3 = heart (worth 10).',
  780:'On the hard half (levels past 16) a heart also breeds a new club; if it landed, add it to the clubs you must collect.',
  790:'Spawn a smiley, jingle, +10, one fewer heart, finish (grow).',
  800:'10 = stone -> try to push it.',
  810:'TA = the cell on the far side of the stone, in the same direction.',
  840:'If that far cell is not empty the stone cannot move -> 910 (blocked).',
  850:'Otherwise shove the stone into TA, erase the tail, and move.',
  870:'1 = smiley -- the bad one.',
  880:'A descending 50-note wail.',
  890:'-50, drop another smiley, and move onto it (grow).',
  900:'24/26/27 = a moving arrow -> instant death (jump to 510).',
  910:'A wall or your own body: you cannot enter. Keep the old heading (E=F), lose a little bonus, buzz, skip the move. Walls do not kill you here.',
  920:'Straight horizontal run -> the cell you leave becomes = (205).',
  930:'Straight vertical run -> the cell you leave becomes || (186).',
  940:'These four lines choose the corner glyph (corner-pieces) for a bend, from the new heading E and the old heading F.',
  980:'Append the new head: BTEL+1, store its offset in T(BTEL), remember F=E, paint the block (219).',
  990:'If the trail array is full (15000) the snake has nowhere to grow -> death.',
  1000:'The shimmer: step through the body by twos, making alternate cells bright (15) and their neighbours normal (7). BTEL flips parity each move, so the bright dashes appear to crawl.',
  1010:'ON LEVEL GOSUB -> this level animation: 1170 (nothing) on calm levels, or the arrow/gate movers (2130/1830/1970).',
  1030:'Level cleared. Pour the leftover bonus into the score, 5 at a time...',
  1070:'...then reward finishing with +1 life.',
  1090:'All 32 done (or out of lives): show Einde (The End).',
  1130:'j = ja = yes -> restart at 230; otherwise clear, thank the player, END.',
  1150:'Random even offset in the playfield (480..3200); even = a character byte, not a colour byte.',
  1160:'Only if the cell is empty (32): write L there and flag K1=1 (it landed).',
  1190:'Add OP to the score and redraw it.',
  1200:'Beat the high score? update ZORE and show it.',
  1480:'The workhorse: POKE one character at column X, row Y (here a stone, 10). Shared by several layouts.',
  1580:'READ 13 coordinate pairs from the DATA and punch doorways through the room walls.',
  1630:'DATA: the doorway coordinates (row,col pairs).',
  1670:'B(I) = the opening row of gate I. Draw a full column, then blank the 3-cell gap and cap it.',
  1850:'When an arrow runs off the top (row 4) it wraps back to the far side (+2720 = 17 rows).',
  1860:'An arrow about to step onto the head (219)? RETURN 510 = death.',
  1890:'Otherwise restore the vacated cell, move the arrow one row, draw it, remembering what was underneath in D(I,2).',
  1970:'Move the vertical arrows: one going right (26), one left (27) per row, each frame.',
  2000:'Hit the head (219)? death.',
  2070:'Hit the head (219)? death.',
  2130:'For each of the 9 gates, slide its opening; the =96 sums test that three cells are blank before shifting.',
  2230:'Move the opening down a row; past row 16 it wraps back to row 4.',
  2260:'PLAY "mb" = music in background (do not block), then three rising blips.',
  2320:'Level 1: Z=999 (turn-based), scatter 75 of each, bonus drops 10/move, no maze.',
  2410:'From level 9 (Z<1) the snake moves on its own and speeds up; 2410-2480 mirror 2320-2390 but real-time.',
};

const EXPLAINED_UI = {
  en: { line: 'line ', lines: 'lines ', loadError: 'Could not load SNEEKIE.BAS — ' },
  nl: { line: 'regel ', lines: 'regels ', loadError: 'Kan SNEEKIE.BAS niet laden — ' },
  uk: { line: 'рядок ', lines: 'рядки ', loadError: 'Не вдалося завантажити SNEEKIE.BAS — ' }
};
const explainedLang = () => {
  const lang = typeof window.sneekieLang === 'function' ? window.sneekieLang() : 'en';
  return lang === 'nl' || lang === 'uk' ? lang : 'en';
};
const exText = key => EXPLAINED_UI[explainedLang()][key] || EXPLAINED_UI.en[key] || key;

const EXPLAINED_NL_SECTIONS = [
  ['Opstarten &amp; het scherm vinden', `Drie dingen in twee regels. <code>DEFINT A-Y</code> maakt variabelen A&hellip;Y integer en laat de <code>Z*</code>-namen floating-point; daarom heten timer en score <code>Z</code>, <code>ZCORE</code>, <code>ZORE</code>. <code>SCREEN 0:WIDTH 80</code> kiest 80&times;25 tekst, en <code>PEEK(&amp;H449)</code> vraagt de BIOS of dit een mono- of kleurenscherm is.`],
  ['Het kader &amp; scorepaneel tekenen', `Gewone <code>LOCATE&hellip;PRINT</code> tekent de vaste meubels: buitenkader, titelbalk en legenda onderaan. De laatste regel <code>POKE</code>t de vier icoontjes rechtstreeks op vaste schermoffsets.`],
  ['Nieuw spel starten', `Zet de score op nul, geef drie levens en speel levels 1&rarr;32.`],
  ['De levelloop', `Elk level wist de binnenste 17 rijen, zet een tweecellige slang in het midden en springt via <code>ON LEVEL GOSUB</code> naar het recept van dat level.`],
  ['Statusregel &amp; items strooien', `Toon bonus, levens en level, en strooi daarna <code>AANTAL</code> harten en <code>AANTAL</code> smileys op willekeurige lege vakken.`],
  ['De &ldquo;Level n&rdquo;-popup', `Kopieer het schermdeel onder de popup naar <code>S()</code>, teken de box, wacht op een toets en plak het scherm terug zodat er geen gat achterblijft.`],
  ['De move-loop &mdash; een toets lezen', `Het hart van het spel. Per tick wacht de code maximaal <code>Z</code> seconden op een toets. Vroege levels wachten voor altijd; latere levels bewegen vanzelf door.`],
  ['Bonus uitgeven en toets sorteren', `Elke tick haalt <code>BMIN</code> van de bonus. Daarna bepaalt de code of de toets een pijltje, ESC of rommel is.`],
  ['Cheats en de kop draaien', `F10 slaat over, F9 geeft een leven en slaat over. Anders wordt de richting vertaald naar een schermstap: &plusmn;160 voor een rij, &plusmn;2 voor een kolom.`],
  ['Wat staat er in het volgende vak?', `De grote beslissing: leeg vak, klaver, hart, steen, smiley of pijl. Eten laat de slang groeien; pijlen doden; stenen kunnen worden geduwd.`],
  ['Geblokkeerd &mdash; muren en eigen staart', `Een muur of eigen lijf doodt je niet. De slang blijft staan, houdt de oude richting, verliest wat bonus en zoemt.`],
  ['Lijf tekenen, kop laten groeien, animeren', `Het oude kopvak wordt het juiste box-drawing-stuk, de nieuwe kop wordt toegevoegd, het lijf glimt en de vijandroutine van dit level doet een stap.`],
  ['Level gehaald &mdash; bonus innen', `De resterende bonus gaat vijf punten per keer naar de score, daarna krijg je een extra leven.`],
  ['Einde / opnieuw spelen', `Na alle 32 levels of wanneer de levens op zijn, toont de code <i>Einde</i>, vraagt of je opnieuw wilt spelen, en start opnieuw of stopt.`],
  ['Item op een willekeurig vak zetten', `Kies een willekeurige even offset in het speelveld. Even betekent: tekenbyte, niet kleurbyte. Alleen een leeg vak wordt gevuld.`],
  ['Score &amp; highscore', `Tel <code>OP</code> bij de score op en werk de highscore bij als die wordt verbeterd.`],
  ['Layout: het labyrint', `Geneste lussen tekenen een web van enkele lijnen en kruisingen: het dichtste doolhof.`],
  ['Layout: verspreide stenen', `Legt &#9689; stenen in zigzag. De helper op regel 1480 zet een teken op kolom X, rij Y.`],
  ['Layout: kamers met deuropeningen', `Bouwt een raster van kamers en leest daarna DATA-coordinaten om doorgangen in de muren te slaan.`],
  ['Layout: verticale poorten', `Kolommen met een opening van drie vakken; <code>B(I)</code> onthoudt per poort waar de opening zit.`],
  ['Layout: poorten + stenen', `De poortlayout plus een strooiing stenen.`],
  ['Gevaar: omhoogpijlen', `Elke even kolom krijgt een omhoogpijl die per tick een rij stijgt en bovenaan terugwikkelt. Een pijl op de kop is fataal.`],
  ['Gevaar: horizontale pijlen', `Per rij bewegen twee pijlen: een naar rechts en een naar links. Ze wikkelen aan de rand terug.`],
  ['Gevaar: bewegende poorten', `De negen poortopeningen schuiven. De <code>=96</code>-tests controleren of drie vakken leeg zijn voordat een opening verplaatst.`],
  ['Het pickup-jingletje', `<code>PLAY "mb"</code> betekent achtergrondmuziek, gevolgd door drie stijgende bliepjes.`],
  ['De popupbox', `Tekent de dubbele kaderbox achter "Level n" en "Einde".`],
  ['De 32 levelrecepten', `Elke regel zet <code>Z</code>, <code>AANTAL</code> en <code>BMIN</code> en kiest een layout. De tabellen hergebruiken de eerste 16 recepten voor levels 17&ndash;32.`],
];

const EXPLAINED_UK_SECTIONS = [
  ['Завантаження і пошук екрана', `Три завдання у двох рядках. <code>DEFINT A-Y</code> робить змінні A&hellip;Y цілими, але залишає <code>Z*</code> числами з рухомою комою; тому таймер і рахунок названі <code>Z</code>, <code>ZCORE</code>, <code>ZORE</code>. <code>SCREEN 0:WIDTH 80</code> вибирає текст 80&times;25, а <code>PEEK(&amp;H449)</code> питає BIOS, чи це монохромний або кольоровий екран.`],
  ['Малювання рамки і панелі рахунку', `Звичайний <code>LOCATE&hellip;PRINT</code> малює сталі елементи: зовнішню рамку, заголовок і легенду внизу. Останній рядок робить <code>POKE</code> чотирьох іконок прямо у фіксовані екранні зміщення.`],
  ['Початок нової гри', `Обнулити рахунок, дати три життя і пройти рівні 1&rarr;32.`],
  ['Цикл рівнів', `Кожен рівень очищає 17 внутрішніх рядків, ставить двоклітинкову змію в центрі і через <code>ON LEVEL GOSUB</code> переходить до рецепта цього рівня.`],
  ['Статусний рядок і розсипання предметів', `Показати бонус, життя і рівень, а потім розсипати <code>AANTAL</code> сердець і <code>AANTAL</code> смайликів на випадкові порожні клітинки.`],
  ['Вікно &ldquo;Рівень n&rdquo;', `Скопіювати частину екрана під спливним вікном у <code>S()</code>, намалювати рамку, дочекатися клавіші і вставити екран назад, щоб не лишити дірки.`],
  ['Цикл руху &mdash; читання клавіші', `Серце гри. На кожному такті код чекає до <code>Z</code> секунд на клавішу. Ранні рівні чекають безкінечно; пізніші рухаються самі.`],
  ['Витрата бонусу і сортування клавіші', `Кожен такт віднімає <code>BMIN</code> від бонусу. Потім код визначає, чи клавіша є стрілкою, ESC або марним вводом.`],
  ['Чити і поворот голови', `F10 пропускає рівень, F9 додає життя і пропускає. Інакше напрям перекладається в крок екрана: &plusmn;160 для рядка, &plusmn;2 для стовпця.`],
  ['Що в наступній клітинці?', `Головне рішення: порожньо, трефа, серце, камінь, смайлик або стріла. Їжа збільшує змію; стріли вбивають; камені можна штовхати.`],
  ['Заблоковано &mdash; стіни і власний хвіст', `Стіна або власне тіло не вбивають. Змія стоїть, зберігає старий напрям, втрачає трохи бонусу і дзижчить.`],
  ['Малювання тіла, ріст голови, анімація', `Стара клітинка голови стає правильним символом рамки, нова голова додається, тіло блимає, а ворожа процедура цього рівня робить крок.`],
  ['Рівень пройдено &mdash; забрати бонус', `Залишковий бонус переходить у рахунок по пʼять очок за раз, після чого ви отримуєте додаткове життя.`],
  ['Кінець / грати знову', `Після всіх 32 рівнів або коли життя закінчилися, код показує <i>Einde</i>, питає про повтор і або стартує знову, або завершується.`],
  ['Поставити предмет у випадкову клітинку', `Вибрати випадкове парне зміщення у полі. Парне означає байт символу, не байт кольору. Заповнюється лише порожня клітинка.`],
  ['Рахунок і рекорд', `Додати <code>OP</code> до рахунку і оновити рекорд, якщо його побито.`],
  ['Схема: лабіринт', `Вкладені цикли малюють мережу одинарних ліній і перехресть: найщільніший лабіринт.`],
  ['Схема: розкидані камені', `Кладе камені &#9689; зигзагом. Допоміжна процедура на рядку 1480 ставить символ у стовпець X, рядок Y.`],
  ['Схема: кімнати з дверима', `Будує сітку кімнат, а потім читає DATA-координати, щоб пробити проходи у стінах.`],
  ['Схема: вертикальні брами', `Колонки з отвором у три клітинки; <code>B(I)</code> памʼятає рядок отвору кожної брами.`],
  ['Схема: брами + камені', `Схема брам плюс розсипані камені.`],
  ['Небезпека: стріли вгору', `Кожна парна колонка отримує стрілу вгору, яка на кожному такті піднімається на рядок і загортається зверху. Стріла на голові смертельна.`],
  ['Небезпека: горизонтальні стріли', `У кожному рядку рухаються дві стріли: одна праворуч, одна ліворуч. На краю вони загортаються назад.`],
  ['Небезпека: рухомі брами', `Девʼять отворів у брамах зсуваються. Тести <code>=96</code> перевіряють, що три клітинки порожні перед переміщенням отвору.`],
  ['Дзвін предмета', `<code>PLAY "mb"</code> означає фонову музику, потім ідуть три висхідні сигнали.`],
  ['Спливна рамка', `Малює подвійну рамку за "Level n" і "Einde".`],
  ['32 рецепти рівнів', `Кожен рядок задає <code>Z</code>, <code>AANTAL</code> і <code>BMIN</code>, а також вибирає схему. Таблиці повторно використовують перші 16 рецептів для рівнів 17&ndash;32.`],
];

const EXPLAINED_NL_NOTES = {
  80:'DEFINT A-Y = integers; Z* blijft floating-point voor timer en score. SCREEN 0:WIDTH 80 kiest 80x25 tekst.',
  90:'PEEK(&H449) is de BIOS-videomodus. Mode 7 = mono op &HB000; anders kleur op &HB800.',
  100:'DEF SEG=VIDEO richt PEEK/POKE op schermgeheugen. De arrays: T()=slang, S()=popup-backup, B()=poorten, D()=pijlen.',
  110:'Bovenrand van het kader: hoek + 78 lijnen + hoek.',
  130:'De titel in de bovenbalk.',
  200:'Onderkant van het kader.',
  210:'Zet de vier legenda-icoontjes direct in schermgeheugen: smiley(1), steen(10), klaver(5), hart(3).',
  230:'Nieuw spel: score 0, drie levens.',
  250:'Wis de 17 binnenrijen, maar laat de zijmuren staan.',
  280:'Startslang: staart op offset 2000, kop op 1840; hij begint omhoog. BTEL=kopslot, ETEL=staartslot.',
  290:'Teken de kop als blok (219), de staart als dubbele lijn (186), kop helder (15).',
  300:'Per-level reset: richting omhoog, nog niets verzameld, bonus 10000.',
  310:'ON LEVEL GOSUB kiest het levelrecept: snelheid, itemaantal, bonusstap en doolhof.',
  340:'Strooi AANTAL smileys en AANTAL harten.',
  350:'GOSUB 1150 zet een teken op een willekeurig leeg vak; K1=1 betekent dat het hart landde.',
  370:'Bewaar het 4x42-gebied onder de popup in S().',
  400:'Leeg de BIOS-toetsenbuffer en wacht op een toets.',
  410:'Plak het bewaarde schermdeel terug en wis de popup.',
  420:'Speel dit level tot alle harten en klavers weg zijn.',
  430:'Lees een wachtende toets en start een timer.',
  450:'Blijf INKEY$ pollen tot een toets komt of Z seconden voorbij zijn.',
  470:'Elke zet kost BMIN bonus.',
  490:'Een echte pijltjestoets is twee tekens; lengte <> 1 gaat naar de bewegingscode.',
  500:'Een enkel teken dat geen ESC is, is rommel en wordt als botsing behandeld.',
  510:'ESC of een dodelijke hit: de dood/opgeven-routine.',
  540:'Wacht tot de geluidswachtrij leeg is.',
  550:'Rol de slang staart-eerst af...',
  580:'...wis elk vak met een bliep...',
  590:'...schuif de staart op en trek bonus af.',
  610:'Verlies een leven; reset hart- en klavertellers.',
  620:'Geen levens? Zet LEVEL=32 zodat de FOR-loop eindigt; anders speel dit level opnieuw.',
  640:'Twee-tekentoets: haal de scancode uit byte twee. Bij timeout blijft E gelijk en beweegt de slang door.',
  650:'A = waar de kop nu staat.',
  660:'Scancode 68 = F10, level overslaan.',
  670:'Scancode 67 = F9, gratis leven en overslaan.',
  680:'Richting naar schermstap: +/-160 voor rij, +/-2 voor kolom.',
  700:'Kijk wat er al in het doelvak staat.',
  710:'32 = leeg, dus gewoon bewegen.',
  720:'Wis de staart en schuif de staartpointer op.',
  740:'5 = klaver, 25 punten.',
  750:'Strooi een nieuwe smiley en speel de jingle.',
  760:'+25, een klaver minder. Geen staart wissen, dus groei.',
  770:'3 = hart, 10 punten.',
  780:'In de harde helft kan een hart een nieuwe klaver maken.',
  790:'Strooi smiley, jingle, +10, een hart minder, groei.',
  800:'10 = steen; probeer hem te duwen.',
  810:'TA = het vak achter de steen.',
  840:'Als dat vak niet leeg is, kan de steen niet bewegen.',
  850:'Duw de steen, wis de staart en beweeg.',
  870:'1 = smiley, de slechte.',
  880:'Een dalende klaagtoon van 50 noten.',
  890:'-50, strooi nog een smiley, en groei erop.',
  900:'24/26/27 = bewegende pijl, instant dood.',
  910:'Muur of eigen lijf: niet naar binnen. Oude richting houden, bonus verliezen, zoemen.',
  920:'Horizontaal recht stuk wordt 205.',
  930:'Verticaal recht stuk wordt 186.',
  940:'Deze regels kiezen de hoekglyph voor een bocht uit nieuwe richting E en oude richting F.',
  980:'Voeg de nieuwe kop toe: BTEL+1, offset bewaren, kop tekenen.',
  990:'Trail-array vol? Dan kan de slang nergens meer groeien: dood.',
  1000:'De glans: alternerende lijfvakken worden helder. Omdat BTEL van pariteit wisselt, lijkt het te lopen.',
  1010:'ON LEVEL GOSUB kiest de animatie van dit level: niets, pijlen of poorten.',
  1030:'Level gehaald: stort de resterende bonus in de score.',
  1070:'Geef een extra leven voor het halen van het level.',
  1090:'Alle 32 klaar of geen levens: toon Einde.',
  1130:'j = ja: opnieuw starten; anders bedanken en END.',
  1150:'Willekeurige even offset in het speelveld; even = tekenbyte.',
  1160:'Alleen als het vak leeg is: schrijf L en zet K1=1.',
  1190:'Tel OP bij de score op en teken opnieuw.',
  1200:'Highscore verbeterd? Werk ZORE bij en toon hem.',
  1480:'Werkpaard: POKE een teken op kolom X, rij Y.',
  1580:'Lees 13 coordinaatparen en maak deuropeningen in de kamermuren.',
  1630:'DATA met deurcoordinaten.',
  1670:'B(I) is de rij van opening I; teken een kolom en maak een drie-vaks gat.',
  1850:'Loopt een pijl boven uit beeld, dan wikkelt hij terug naar de andere kant.',
  1860:'Pijl stapt op de kop? RETURN 510 = dood.',
  1890:'Herstel het verlaten vak, verplaats de pijl en onthoud wat eronder lag.',
  1970:'Beweeg horizontale pijlen: een naar rechts en een naar links per rij.',
  2000:'Raakt hij de kop? dood.',
  2070:'Raakt hij de kop? dood.',
  2130:'Schuif elke poortopening; de =96-sommen testen drie lege vakken.',
  2230:'Beweeg de opening omlaag; voorbij rij 16 wikkelt hij terug naar rij 4.',
  2260:'PLAY "mb" = muziek op de achtergrond, daarna drie stijgende bliepjes.',
  2320:'Level 1: Z=999, 75 items, bonus daalt 10 per zet, geen doolhof.',
  2410:'Vanaf level 9 beweegt de slang vanzelf; 2410-2480 spiegelen 2320-2390 maar realtime.',
};

const localizedExplained = explainedLang();
if(localizedExplained === 'nl' || localizedExplained === 'uk'){
  const sections = localizedExplained === 'uk' ? EXPLAINED_UK_SECTIONS : EXPLAINED_NL_SECTIONS;
  sections.forEach(([t, h], i) => { if(SECTIONS[i]){ SECTIONS[i].t = t; SECTIONS[i].h = h; } });
  if(localizedExplained === 'nl') Object.assign(NOTES, EXPLAINED_NL_NOTES);
}

/* ---------- render ---------- */
let lines = [];
const listing = document.getElementById('listing');
const tocList = document.getElementById('toc-list');

let block = null;
function freshBlock(){ block = document.createElement('div'); block.className = 'src'; listing.appendChild(block); }
function addCard(sec){
  const c = document.createElement('section');
  c.className = 'card'; c.id = 's-' + sec.num;
  const lastLine = sectionEndLine(sec);
  const range = (lastLine && lastLine !== sec.at) ? exText('lines') + sec.at + '&ndash;' + lastLine : exText('line') + sec.at;
  c.innerHTML =
    '<div class="head"><span class="badge">' + sec.num + '</span>' +
    '<h2>' + sec.t + '</h2><span class="lines">' + range + '</span></div>' +
    '<div class="prose">' + sec.h + '</div>';
  listing.appendChild(c);
  const li = document.createElement('li');
  li.innerHTML = '<span class="n">' + sec.num + '</span><a href="#s-' + sec.num + '">' + sec.t + '</a>';
  tocList.appendChild(li);
  freshBlock();
}
/* last BASIC line covered by a section = (next section's start) found in the source, minus one step */
function sectionEndLine(sec){
  const idx = SECTIONS.indexOf(sec);
  const next = SECTIONS[idx + 1];
  if(!next) return null;
  let last = null;
  for(const l of lines){ const n = lineNo(l); if(n !== null && n >= sec.at && n < next.at) last = n; }
  return last;
}

function renderExplained(src){
lines = src.replace(/\n$/, '').split('\n').slice(10);   // drop the 9-line OCR banner + blank, like source.js
freshBlock();
for(const line of lines){
  const no = lineNo(line);
  if(no !== null && SEC_AT[no]) addCard(SEC_AT[no]);

  const row = document.createElement('div'); row.className = 'ln-row';
  for(const [cls, text] of tokenizeBasicLine(line)){
    if(cls === 'ws'){ row.appendChild(document.createTextNode(text)); }
    else { const sp = document.createElement('span'); sp.className = 't-' + cls; sp.textContent = text; row.appendChild(sp); }
  }
  if(!row.childNodes.length) row.appendChild(document.createTextNode('​'));
  block.appendChild(row);

  if(no !== null && NOTES[no]){
    const a = document.createElement('div'); a.className = 'annot';
    const mk = document.createElement('span'); mk.className = 'mk'; mk.textContent = '↳ ';
    a.appendChild(mk); a.appendChild(document.createTextNode(NOTES[no]));
    block.appendChild(a);
  }
}
}
try { renderExplained(BAS); }
catch(err){ listing.textContent = exText('loadError') + err.message; }
