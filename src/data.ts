/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Employee } from './types';

export const GROUPS = [
  { id: 'A', name: 'Grup A', isSub: false },
  { id: 'B', name: 'Grup B', isSub: false },
  { id: 'C', name: 'Grup C', isSub: false },
  { id: 'NS', name: 'Non-Shift (NS)', isSub: false },
  { id: 'MTC', name: 'Maintenance (MTC)', isSub: false },
  { id: 'LAB', name: 'Laboratorium (LAB)', isSub: false },
  { id: 'QC', name: 'Quality Control (QC)', isSub: false },
] as const;

export const PREPOPULATED_EMPLOYEES: Employee[] = [
  {
    "noReg": "D0756",
    "nama": "WIDARTO",
    "grup": "A",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D0779",
    "nama": "SAPI'IN",
    "grup": "A",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D0837",
    "nama": "AGUS SUPRIYONO",
    "grup": "A",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D0867",
    "nama": "WUJUD",
    "grup": "A",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D1451",
    "nama": "ISWAHYUDI",
    "grup": "A",
    "jabatan": "OPT. CRANE & ELFORK"
  },
  {
    "noReg": "D1493",
    "nama": "ANDI SUTRISNO",
    "grup": "A",
    "jabatan": "OPT.CENTRIFUGAL DRYER"
  },
  {
    "noReg": "D1543",
    "nama": "MUSLIKIN",
    "grup": "A",
    "jabatan": "OPT.PREP.DYEING"
  },
  {
    "noReg": "D1679",
    "nama": "MINARTO",
    "grup": "A",
    "jabatan": "OPT.CENTRIFUGAL DRYER"
  },
  {
    "noReg": "OS1369",
    "nama": "MUSTAKIM",
    "grup": "A",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "DK3429",
    "nama": "MOCH. DAVID A K",
    "grup": "A",
    "jabatan": "OPT.PREP.DYEING"
  },
  {
    "noReg": "DK3630",
    "nama": "M ILHAM BAHRUDIN",
    "grup": "A",
    "jabatan": "OPT.PREP.DYEING"
  },
  {
    "noReg": "DK2820",
    "nama": "ROMLI RORENO",
    "grup": "MTC",
    "jabatan": "OPT. MTC DYE A"
  },
  {
    "noReg": "D0658",
    "nama": "M ALI SODIKIN",
    "grup": "A",
    "jabatan": "OPT. PC/INSPECT"
  },
  {
    "noReg": "D1354",
    "nama": "SUPRAYUDI",
    "grup": "A",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "D1526",
    "nama": "MOH SUPRIYANTO",
    "grup": "A",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "DK3419",
    "nama": "GALI PRASETYO",
    "grup": "A",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "DK3560",
    "nama": "MIRSA EDI SASONGKO",
    "grup": "A",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "DK3795",
    "nama": "M. FENDI EKA PRATAMA",
    "grup": "A",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "DK2854",
    "nama": "ROHMAN RIZKY F",
    "grup": "A",
    "jabatan": "OPT.PC"
  },
  {
    "noReg": "D1289",
    "nama": "WAHYUNINGSIH B",
    "grup": "A",
    "jabatan": "OPT.PERBAIKAN"
  },
  {
    "noReg": "D1537",
    "nama": "SRI YATI",
    "grup": "A",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "DK2476",
    "nama": "KUMALASARI TUNGGAL",
    "grup": "A",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "DK2555",
    "nama": "LILIK KHOIRUL A.",
    "grup": "A",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "DK3400",
    "nama": "RINA YUNIAWATI",
    "grup": "A",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "DK3408",
    "nama": "SISKA IRAWAN",
    "grup": "A",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "D0712",
    "nama": "HARIYATI",
    "grup": "A",
    "jabatan": "OPT.REWINDING HANK"
  },
  {
    "noReg": "D1402",
    "nama": "SITI CHODIJAH",
    "grup": "A",
    "jabatan": "OPT.REWINDING HANK"
  },
  {
    "noReg": "DK4142",
    "nama": "ANISA NUR AINI",
    "grup": "A",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D0718",
    "nama": "ISMAMI",
    "grup": "A",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1539",
    "nama": "SITI ANISAH",
    "grup": "A",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1554",
    "nama": "ENDANG SULASTRI",
    "grup": "A",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1788",
    "nama": "SISWI HANDAYANI",
    "grup": "A",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1789",
    "nama": "WIWIN SUPARTI",
    "grup": "A",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "DK096",
    "nama": "WIJI RAHAYU",
    "grup": "A",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "DK3397",
    "nama": "SHOLIKAH",
    "grup": "A",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "DK4070",
    "nama": "M. SOLIKIN",
    "grup": "A",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "DK3503",
    "nama": "KURNIAWAN BUDIANTO",
    "grup": "MTC",
    "jabatan": "OPT. MTC WINDING A"
  },
  {
    "noReg": "D0663",
    "nama": "M QOSIM",
    "grup": "B",
    "jabatan": "OPT. RF DRYER"
  },
  {
    "noReg": "D0671",
    "nama": "M HISYAM",
    "grup": "B",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D0734",
    "nama": "KHOIRUL",
    "grup": "B",
    "jabatan": "OPT. CRANE & ELFORK"
  },
  {
    "noReg": "D1406",
    "nama": "MUHAMMAD NUR RIFAI",
    "grup": "B",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D1495",
    "nama": "BASUNI",
    "grup": "B",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D1842",
    "nama": "AGUNG PRASETYA",
    "grup": "B",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D1943",
    "nama": "NUR M.SYAFI'I",
    "grup": "B",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "DK2557",
    "nama": "ANDRIAS PRAMONO",
    "grup": "B",
    "jabatan": "OPT. RF DRYER"
  },
  {
    "noReg": "DK3396",
    "nama": "ANDIK PUJO S",
    "grup": "B",
    "jabatan": "OPT.CENTRIFUGAL DRYER"
  },
  {
    "noReg": "DK3427",
    "nama": "MUJIARTO AGUS S",
    "grup": "B",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "DK4031",
    "nama": "SURYA ABDIDHARMA C. A.",
    "grup": "B",
    "jabatan": "OPT.CENTRIFUGAL DRYER"
  },
  {
    "noReg": "DK4038",
    "nama": "DEDIK IRAWAN",
    "grup": "B",
    "jabatan": "OPT.PREP.DYEING"
  },
  {
    "noReg": "DK3499",
    "nama": "CHOIRUL MUKMININ",
    "grup": "MTC",
    "jabatan": "OPT. MTC DYE B"
  },
  {
    "noReg": "DK3417",
    "nama": "SUNARTO",
    "grup": "B",
    "jabatan": "OPT. PC/INSPECT"
  },
  {
    "noReg": "D0740",
    "nama": "WARTO",
    "grup": "B",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "D0777",
    "nama": "BAMBANG SUBAGYO",
    "grup": "B",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "D1844",
    "nama": "ISMANTO",
    "grup": "B",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "DK3796",
    "nama": "ADI PRASETYO",
    "grup": "B",
    "jabatan": "OPT.PC"
  },
  {
    "noReg": "D1505",
    "nama": "ANA IFADAH",
    "grup": "B",
    "jabatan": "OPT.PERBAIKAN"
  },
  {
    "noReg": "D0736",
    "nama": "NANIN LESTARI",
    "grup": "B",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "D1391",
    "nama": "ENDANG SUCIATI",
    "grup": "B",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "D1793",
    "nama": "ITA WIDURI",
    "grup": "B",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "DK2478",
    "nama": "RUMIATI",
    "grup": "B",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "DK3401",
    "nama": "WIYANA MUSTARI",
    "grup": "B",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "DK3403",
    "nama": "SRI HANDAYANI",
    "grup": "B",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "D1436",
    "nama": "JUMA'ATIN",
    "grup": "B",
    "jabatan": "OPT.REWINDING HANK"
  },
  {
    "noReg": "D1376",
    "nama": "CHUSNUL KHOTIMAH",
    "grup": "B",
    "jabatan": "OPT.REWINDING PEMBESARAN"
  },
  {
    "noReg": "DK3406",
    "nama": "RISKA ANJARWATI",
    "grup": "B",
    "jabatan": "OPT.REWINDING PEMBESARAN"
  },
  {
    "noReg": "D0859",
    "nama": "MISNAH",
    "grup": "B",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1303",
    "nama": "KATIN FIDIASTUTI",
    "grup": "B",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1435",
    "nama": "SRI WAHYUNI D",
    "grup": "B",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1681",
    "nama": "LILIS SURIYATI",
    "grup": "B",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1747",
    "nama": "YULIATI",
    "grup": "B",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "DK2475",
    "nama": "NUR LAILY SAGITA",
    "grup": "B",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "DK3410",
    "nama": "HAMIDAH",
    "grup": "B",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "DK4069",
    "nama": "OCHTAVIAN DWI AIRLANGGA",
    "grup": "B",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "OS1312",
    "nama": "M. NUR ZILJIANUDIN",
    "grup": "B"
  },
  {
    "noReg": "DK3432",
    "nama": "MUHAMMAD ADI",
    "grup": "MTC",
    "jabatan": "OPT. MTC WINDING B"
  },
  {
    "noReg": "D0683",
    "nama": "HADI WALUYO",
    "grup": "C",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D0763",
    "nama": "IMAM SUBCHI",
    "grup": "C",
    "jabatan": "OPT. RF DRYER"
  },
  {
    "noReg": "D0836",
    "nama": "SUPRAYITNO",
    "grup": "C",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D1497",
    "nama": "AGUS SUSANTO B",
    "grup": "C",
    "jabatan": "OPT.CENTRIFUGAL DRYER"
  },
  {
    "noReg": "D1685",
    "nama": "COKRO",
    "grup": "C",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D1754",
    "nama": "JOKO MULYONO",
    "grup": "C",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "D1845",
    "nama": "MOH MAHFUD",
    "grup": "C",
    "jabatan": "OPT. CRANE & ELFORK"
  },
  {
    "noReg": "DK2463",
    "nama": "M. IKHSAN",
    "grup": "C",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "DK2761",
    "nama": "FIKI YULIONO",
    "grup": "C",
    "jabatan": "OPT.DYEING HT THIES & FONG's"
  },
  {
    "noReg": "DK3426",
    "nama": "RUDI HERMAWAN",
    "grup": "C",
    "jabatan": "OPT.PREP.DYEING"
  },
  {
    "noReg": "DK3502",
    "nama": "M. ARIS ZAKARIA",
    "grup": "C",
    "jabatan": "OPT. RF DRYER"
  },
  {
    "noReg": "DK4039",
    "nama": "MUHAMMAD FARKHANUDDIN",
    "grup": "C",
    "jabatan": "OPT.PREP.DYEING"
  },
  {
    "noReg": "DK3431",
    "nama": "FIRNANDA PUJI P",
    "grup": "MTC",
    "jabatan": "OPT. MTC DYE C"
  },
  {
    "noReg": "DK3416",
    "nama": "DARSONO",
    "grup": "C",
    "jabatan": "OPT. PC/INSPECT"
  },
  {
    "noReg": "D0841",
    "nama": "HARIYANTO",
    "grup": "C",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "DK3420",
    "nama": "MUHAMMAD HANEN",
    "grup": "C",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "DK3421",
    "nama": "ABDULLAH SAID",
    "grup": "C",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "DK2856",
    "nama": "DAVID EFENDI",
    "grup": "C",
    "jabatan": "OPT.PC"
  },
  {
    "noReg": "D1390",
    "nama": "AGUS RENY RAHAYU",
    "grup": "C",
    "jabatan": "OPT.PERBAIKAN"
  },
  {
    "noReg": "D0694",
    "nama": "DAWAMAH",
    "grup": "C",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "D0753",
    "nama": "SYAROFAH",
    "grup": "C",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "D1389",
    "nama": "RIYANTI",
    "grup": "C",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "D1488",
    "nama": "SULIANI",
    "grup": "C",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "DK3404",
    "nama": "LAILATUL DINA P",
    "grup": "C",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "D0770",
    "nama": "RUKIYATI",
    "grup": "C",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "D1485",
    "nama": "DARIATI B",
    "grup": "C",
    "jabatan": "OPT.REWINDING HANK"
  },
  {
    "noReg": "D1398",
    "nama": "SITI CHOIRIYAH",
    "grup": "C",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1422",
    "nama": "ISTIKHANAH",
    "grup": "C",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1502",
    "nama": "ERNA SETYOWATI",
    "grup": "C",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "D1568",
    "nama": "CHUSNUL CHOTIMAH W",
    "grup": "C",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "DK3402",
    "nama": "RIFATUL AZIZAH",
    "grup": "C",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "DK3505",
    "nama": "SITI MARDIYAH",
    "grup": "C",
    "jabatan": "OPT.SOFT WINDING"
  },
  {
    "noReg": "DK4068",
    "nama": "M. ULIL ABROR",
    "grup": "C",
    "jabatan": "OPT.VACUM"
  },
  {
    "noReg": "DK4066",
    "nama": "CANDRA IRAWAN",
    "grup": "C",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "DK4067",
    "nama": "NOR DITA PAWESTRI",
    "grup": "C",
    "jabatan": "OPT.REWINDING PEMBESARAN"
  },
  {
    "noReg": "DK4390",
    "nama": "AFIQAH DWI OCTAVIANTI",
    "grup": "C"
  },
  {
    "noReg": "OS1315",
    "nama": "SEPTIAN ADITYA R.",
    "grup": "C"
  },
  {
    "noReg": "D0807",
    "nama": "DIDIK SUSIYANTO",
    "grup": "MTC",
    "jabatan": "OPT. MTC WINDING C"
  },
  {
    "noReg": "D0794",
    "nama": "M YASIN",
    "grup": "MTC",
    "jabatan": "OPT. MTC DYE"
  },
  {
    "noReg": "D1775",
    "nama": "WIJI SAMPURNO",
    "grup": "MTC",
    "jabatan": "OPT. MTC DYE"
  },
  {
    "noReg": "DK3632",
    "nama": "KASIYANTO",
    "grup": "MTC",
    "jabatan": "OPT. MTC DYE"
  },
  {
    "noReg": "D0773",
    "nama": "KASIONO",
    "grup": "MTC",
    "jabatan": "OPT. MTC WINDING"
  },
  {
    "noReg": "DK2655",
    "nama": "YUDI",
    "grup": "MTC",
    "jabatan": "OPT. MTC WINDING"
  },
  {
    "noReg": "D2096",
    "nama": "ANDY SETIAWAN",
    "grup": "MTC",
    "jabatan": "OPT. MTC WINDING"
  },
  {
    "noReg": "D1341",
    "nama": "ABAS ZAMANSYAH",
    "grup": "QC",
    "jabatan": "OPT. TS / QC A"
  },
  {
    "noReg": "DK061",
    "nama": "ARIO HERDIANTO",
    "grup": "QC",
    "jabatan": "OPT. TS / QC B"
  },
  {
    "noReg": "DK2574",
    "nama": "EDI WAHYU S.",
    "grup": "QC",
    "jabatan": "OPT. TS / QC C"
  },
  {
    "noReg": "DK2573",
    "nama": "M. SOLEH",
    "grup": "QC",
    "jabatan": "OPT. TS / QC"
  },
  {
    "noReg": "DK2855",
    "nama": "ACHMAD WAHYUDI",
    "grup": "QC",
    "jabatan": "OPT.PC"
  },
  {
    "noReg": "D1381",
    "nama": "EVI FATMAWATI",
    "grup": "LAB",
    "jabatan": "OPT. LAB. TRIAL 1"
  },
  {
    "noReg": "D2095",
    "nama": "YUDI HARIYANTO",
    "grup": "LAB",
    "jabatan": "OPT. LAB. TRIAL 1"
  },
  {
    "noReg": "DK2472",
    "nama": "NURLAILATUL PUJI",
    "grup": "LAB",
    "jabatan": "OPT. LAB. TRIAL 2"
  },
  {
    "noReg": "DK3500",
    "nama": "BAYU KRISTANTO",
    "grup": "LAB",
    "jabatan": "OPT. LAB. TRIAL 1"
  },
  {
    "noReg": "DK4126",
    "nama": "RUDI HARTONO",
    "grup": "NS",
    "jabatan": "OPT.PACKING ADM"
  },
  {
    "noReg": "D0752",
    "nama": "WIANAH",
    "grup": "NS",
    "jabatan": "OPT.REWINDING PEMBESARAN"
  },
  {
    "noReg": "DK2556",
    "nama": "SISKA SARI",
    "grup": "NS",
    "jabatan": "OPT.REWINDING"
  },
  {
    "noReg": "D1487",
    "nama": "YULI WINARSIH",
    "grup": "NS",
    "jabatan": "OPT.REWINDING PEMBESARAN"
  },
  {
    "noReg": "DK2572",
    "nama": "RUSDIANTO",
    "grup": "NS",
    "jabatan": "OPT.SETING SPINDEL"
  },
  {
    "noReg": "DK2853",
    "nama": "DERY PRASETYA",
    "grup": "NS",
    "jabatan": "OPT.SETING SPINDEL"
  },
  {
    "noReg": "DK3293",
    "nama": "FAHRUR ROZI",
    "grup": "NS",
    "jabatan": "OPT. PC"
  },
  {
    "noReg": "DK3633",
    "nama": "ROHANI",
    "grup": "NS",
    "jabatan": "OPT.SETING SPINDEL"
  },
  {
    "noReg": "DK3634",
    "nama": "SAIFUL",
    "grup": "NS",
    "jabatan": "OPT.DOFFER"
  },
  {
    "noReg": "RD075",
    "nama": "M. IRVAN RUSDIAN",
    "grup": "NS",
    "jabatan": "OPT.PACKING"
  },
  {
    "noReg": "RD089",
    "nama": "ADI SUWANDONO",
    "grup": "NS",
    "jabatan": "OPT.PACKING"
  },
  {
    "noReg": "DK4034",
    "nama": "ROBBY AGUNG GUHINARDO",
    "grup": "NS",
    "jabatan": "OPT. PC"
  },
  {
    "noReg": "OS1311",
    "nama": "ARIFIN DENI L.",
    "grup": "NS"
  },
  {
    "noReg": "OS0433",
    "nama": "SUSILO",
    "grup": "NS",
    "jabatan": "OPT. SWEEPER WINDING"
  },
  {
    "noReg": "DK4369",
    "nama": "M. SYHARUL M. H.",
    "grup": "NS",
    "jabatan": "OPT. SWEEPER WINDING"
  },
  {
    "noReg": "DK3921",
    "nama": "HASYIM ASHARI",
    "grup": "NS",
    "jabatan": "OPT.HANK DYEING & CORAK"
  },
  {
    "noReg": "D0872",
    "nama": "YATMO",
    "grup": "NS",
    "jabatan": "OPT.HANK DYEING & CORAK"
  },
  {
    "noReg": "D0876",
    "nama": "KAMIM",
    "grup": "NS",
    "jabatan": "OPT.HANK DYEING & CORAK"
  },
  {
    "noReg": "D1739",
    "nama": "SYAMSUL ARIF",
    "grup": "NS",
    "jabatan": "OPT.HANK DYEING & CORAK"
  },
  {
    "noReg": "DK2465",
    "nama": "M. FERDI HENDRIK W.",
    "grup": "NS",
    "jabatan": "OPT.HANK DYEING & CORAK"
  },
  {
    "noReg": "DK2852",
    "nama": "TIMBUL MUNIR",
    "grup": "NS",
    "jabatan": "OPT. DEVELOPMENT"
  },
  {
    "noReg": "DK3179",
    "nama": "WIWIT ANDRIANTO",
    "grup": "NS",
    "jabatan": "OPT.HANK DYEING & CORAK"
  },
  {
    "noReg": "DK3394",
    "nama": "ACHMAD MUJAHIDIN S",
    "grup": "NS",
    "jabatan": "OPT.HANK DYEING & CORAK"
  },
  {
    "noReg": "DK3395",
    "nama": "MUHAMAD SAPUTRA",
    "grup": "NS",
    "jabatan": "OPT.HANK DYEING & CORAK"
  },
  {
    "noReg": "DK3501",
    "nama": "FENDI LESMONO",
    "grup": "NS",
    "jabatan": "OPT.HANK DYEING & CORAK"
  },
  {
    "noReg": "DK3631",
    "nama": "M. ZAINUL ABIDIN",
    "grup": "NS",
    "jabatan": "OPT.HANK DYEING & CORAK"
  },
  {
    "noReg": "DK4028",
    "nama": "AGUS SUHANDOKO",
    "grup": "NS",
    "jabatan": "OPT.DYEING CORAK  TR"
  },
  {
    "noReg": "DK4029",
    "nama": "M. NURYAQIN",
    "grup": "NS",
    "jabatan": "OPT. RELLING"
  },
  {
    "noReg": "DK4030",
    "nama": "ROZZAQ WAHYU F.",
    "grup": "NS",
    "jabatan": "OPT.DYEING CORAK  TR"
  },
  {
    "noReg": "OS1028",
    "nama": "HERU SETIAWAN",
    "grup": "NS",
    "jabatan": "OPT. SWEEPER DYEING"
  },
  {
    "noReg": "D0868",
    "nama": "WAHYUDI MUHAMMAD",
    "grup": "NS",
    "jabatan": "OPT.GUDANG OBAT"
  },
  {
    "noReg": "D1386",
    "nama": "FATKHUR ROZAK",
    "grup": "NS",
    "jabatan": "OPT.GUDANG OBAT"
  },
  {
    "noReg": "D1292",
    "nama": "SYAMSU",
    "grup": "NS",
    "jabatan": "OPT.GUDANG OBAT"
  },
  {
    "noReg": "D1494",
    "nama": "MASHYUDI",
    "grup": "NS",
    "jabatan": "OPT.GUDANG OBAT"
  },
  {
    "noReg": "DK2470",
    "nama": "FANDI PANGESTU",
    "grup": "NS",
    "jabatan": "OPT.GUDANG OBAT"
  },
  {
    "noReg": "DK3498",
    "nama": "IZZUL MUTTAKIN",
    "grup": "NS",
    "jabatan": "OPT.GUDANG OBAT"
  },
  {
    "noReg": "D1481",
    "nama": "DINA KAEKSI",
    "grup": "NS",
    "jabatan": "ADM . PRODUKSI WINDING"
  },
  {
    "noReg": "DK3504",
    "nama": "EKKY CANDRA SETIAWAN",
    "grup": "NS",
    "jabatan": "ADM . TPM & MAINTENANCE"
  },
  {
    "noReg": "DK4040",
    "nama": "ANANDA DEVIN E. W.",
    "grup": "NS",
    "jabatan": "OPT.DYEING CORAK  TR"
  },
  {
    "noReg": "DK2469",
    "nama": "ZAINUL IMRON R.",
    "grup": "NS",
    "jabatan": "ADM .  PRODUKSI DYEING"
  }
];

// Enrich with unique ID (EMP0000 format)
for (let i = 0; i < PREPOPULATED_EMPLOYEES.length; i++) {
  PREPOPULATED_EMPLOYEES[i].empId = `EMP${String(i + 1).padStart(4, '0')}`;
}

