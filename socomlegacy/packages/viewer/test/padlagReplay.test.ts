import { describe, expect, it } from 'vitest';
import { KitTrigger, padHeld, padStep, type PadState } from '../src/padButton';

/**
 * PRESS PARITY, THE REPLAY (simulation track; reading, pending review): the transcribed pad step and kit trigger
 * (`../src/padButton`: `FUN_002d9ff0` D:L179137-179168, `FUN_002c60c0` D:L166671-166686, `FUN_005c0ae0`
 * D:L476380-476382 / D:L476399-476400, `FUN_005c09f0` D:L476313-476341, `FUN_005c0fd0` D:L476643-476647) driven by the
 * original's own update sequence, measured online.
 *
 * SOURCE -- decoded data from a capture of the original running (a memory trace, relay-1: PCSX2 2.8.2 + r0004, an MP6
 * live match, the 9mm Sub in automatic, 30 presses of 150 ms down / 150 ms up). RS.R8 permits decoded data in a test; no
 * capture file is in git. The archive: agent-mail evidence/weekend-mega-2026-11-14/bugs/captures/padlag/padlag-online.zip,
 * sha256 280e22525c255d29195bc97420d9a927a72c95a81eef663ba34358a3030eeec0 (checked 2026-11-17), its
 * `cases/padlag-150-150.csv` (385 rows, one a game frame: frame = round(clock x 30), the last torn-free snapshot of each).
 * Its reading and review: bugs/padlag-rows-read.md, bugs/padlag-rows-fresh-review.md (PASS WITH FINDINGS); the columns as
 * the bugs seat's reader bugs/tools/padlag-rows.py reads them.
 *
 * DERIVATION (every row after the first, 384): `frame`; `dt` = this row's clock less the previous kept row's (the game's
 * own dt: the timer at a round subtracts exactly it, review (c)), in 1e-4 s; `pad` = the fire button's pad-layer byte
 * (`*(s8*)(P+1+slot)`, slot 10); `trig` = ctrl+0x118; `round` = 1 when kit+0x818 (the pull's count) rose from the previous
 * kept row; `timer` = kit+0x81c at the row, in 1e-5 s. Written `frame:dt:<pad><trig><round>:timer`.
 *
 * KNOWN EXCEPTIONS the reading leaves open -- named here, expected, not forced:
 * - Press 1 (frames 1041-1046), the first after the spawn: pad 2 at 1042 but the round at 1044; a gate after the trigger
 *   state (`FUN_005c0ae0` D:L476424-476449: the weight, the body, the magazine) held it, none logged. The model fires at
 *   1042 (and again at 1044, its timer spent).
 * - Press 7 (frames 1094-1098): its first read is in an update folded into row 1094 (a 50.1 ms clock step: the reader keeps
 *   the last row per frame bin); the round's timer 0.04328 = 0.0600 - 0.0167 says the firing update was 16.7 ms. Fed the
 *   row as one 50.1 ms update the model's timer differs at 1094-1097 and its second round comes at 1096, not 1097.
 * - Press 11: its second round sits in an update folded into row 1134 (a 66.7 ms step that reads pad 3); kit+0x818 does not
 *   show it (the size column does), so neither the table nor the model has it.
 * - Presses 15 and 19: the pad read 1 on two consecutive updates (1165-1166, 1201-1202), which `padStep` from a held button
 *   cannot give (1 -> 2): an update in which the pad layer did not step (a failed read, `FUN_002da930` D:L179820-179862,
 *   not shown). Fed the capture's own pad bytes, the kit reproduces their rounds.
 *
 * The module `../src/padButton` does not exist yet: this file is the RED for the build that adds it.
 */
const PADLAG_150_150 = [
  '946:334:000:0 947:334:000:0 948:333:000:0 949:334:000:0 950:334:000:0 951:333:000:0 952:334:000:0 953:334:000:0 954:333:000:0 955:334:000:0 956:334:000:0 957:333:000:0',
  '958:334:000:0 959:334:000:0 960:333:000:0 961:334:000:0 962:334:000:0 963:333:000:0 964:334:000:0 965:334:000:0 966:333:000:0 967:334:000:0 968:334:000:0 969:333:000:0',
  '971:334:000:0 972:334:000:0 973:333:000:0 974:334:000:0 975:334:000:0 976:333:000:0 977:334:000:0 978:334:000:0 979:333:000:0 980:501:000:0 981:334:000:0 982:334:000:0',
  '983:333:000:0 984:334:000:0 985:334:000:0 986:333:000:0 987:334:000:0 988:334:000:0 989:333:000:0 990:334:000:0 991:334:000:0 992:333:000:0 993:334:000:0 994:334:000:0',
  '995:333:000:0 996:334:000:0 997:334:000:0 998:333:000:0 999:334:000:0 1000:334:000:0 1001:333:000:0 1002:334:000:0 1003:334:000:0 1004:333:000:0 1005:334:000:0 1006:334:000:0',
  '1007:333:000:0 1008:334:000:0 1009:334:000:0 1010:333:000:0 1011:334:000:0 1012:334:000:0 1013:333:000:0 1014:334:000:0 1015:334:000:0 1016:333:000:0 1017:334:000:0 1018:334:000:0',
  '1019:333:000:0 1020:334:000:0 1021:334:000:0 1022:333:000:0 1023:334:000:0 1024:334:000:0 1025:333:000:0 1026:334:000:0 1027:334:000:0 1028:333:000:0 1029:334:000:0 1030:334:000:0',
  '1031:333:000:0 1032:334:000:0 1033:334:000:0 1034:333:000:0 1035:334:000:0 1036:334:000:0 1037:333:000:0 1038:168:000:0 1039:333:000:0 1040:334:000:0 1041:334:100:0 1042:333:220:0',
  '1043:334:210:0 1044:334:211:2663 1045:333:330:0 1046:334:000:0 1047:334:000:0 1048:333:000:0 1049:334:000:0 1050:334:100:0 1051:333:221:2663 1052:334:210:0 1053:500:330:0 1054:167:000:0',
  '1055:334:000:0 1056:334:000:0 1057:333:000:0 1058:334:100:0 1059:334:221:2663 1060:333:210:0 1061:501:211:998 1062:167:210:0 1063:500:330:0 1064:167:000:0 1065:334:000:0 1066:333:000:0',
  '1067:334:100:0 1068:334:221:2663 1069:333:210:0 1070:334:211:2663 1071:334:210:0 1072:333:330:0 1073:334:000:0 1074:334:000:0 1075:333:000:0 1076:334:100:0 1077:334:221:2663 1078:333:210:0',
  '1079:334:211:2663 1080:334:310:0 1081:500:330:0 1082:167:000:0 1083:334:000:0 1084:333:000:0 1085:334:100:0 1086:334:221:2663 1087:333:210:0 1088:334:211:2663 1089:334:210:0 1090:333:330:0',
  '1091:334:000:0 1092:334:000:0 1093:333:000:0 1094:501:221:4328 1095:334:210:992 1096:334:210:0 1097:333:211:2663 1098:334:330:0 1099:334:000:0 1100:333:000:0 1101:334:000:0 1102:334:000:0',
  '1103:333:100:0 1104:334:221:2663 1105:334:210:0 1106:333:211:2663 1107:334:330:0 1109:667:000:0 1110:334:000:0 1111:334:000:0 1112:333:100:0 1113:334:221:2663 1114:334:210:0 1115:333:211:2663',
  '1116:334:330:0 1117:334:000:0 1118:333:000:0 1119:334:000:0 1120:334:000:0 1121:333:100:0 1122:334:221:2663 1123:334:210:0 1124:333:211:2663 1125:334:030:0 1127:667:000:0 1128:334:000:0',
  '1129:334:000:0 1130:333:100:0 1131:334:221:2663 1132:334:210:0 1134:667:330:0 1136:667:000:0 1137:334:000:0 1138:334:000:0 1139:333:100:0 1140:334:221:2663 1141:334:210:0 1142:333:211:2663',
  '1143:334:030:0 1145:667:000:0 1146:334:000:0 1147:334:000:0 1148:333:100:0 1149:334:221:2663 1150:334:210:0 1151:167:211:4328 1152:333:210:992 1153:501:330:0 1154:167:000:0 1155:333:000:0',
  '1156:334:000:0 1157:334:100:0 1158:333:221:2663 1159:334:210:0 1160:334:211:2663 1161:333:210:0 1162:334:330:0 1163:334:000:0 1164:333:000:0 1165:334:100:0 1166:334:100:0 1167:333:221:2663',
  '1168:334:210:0 1169:334:211:2663 1170:333:210:0 1171:334:030:0 1172:334:000:0 1173:333:000:0 1174:334:000:0 1175:334:100:0 1176:333:221:2663 1177:334:210:0 1178:334:211:2663 1179:333:210:0',
  '1180:334:330:0 1181:334:000:0 1182:333:000:0 1183:334:000:0 1184:334:100:0 1185:334:221:2663 1186:333:210:0 1187:334:211:2663 1188:334:210:0 1189:333:330:0 1190:334:000:0 1191:334:000:0',
  '1192:333:000:0 1193:334:100:0 1194:334:221:2663 1195:333:210:0 1196:334:211:2663 1197:334:210:0 1198:500:330:0 1199:167:000:0 1200:334:000:0 1201:333:100:0 1202:334:100:0 1203:334:221:2663',
  '1204:333:210:0 1205:334:211:2663 1206:334:210:0 1207:333:330:0 1208:501:000:0 1209:334:000:0 1210:333:000:0 1211:334:100:0 1212:334:221:2663 1213:333:210:0 1214:334:211:2663 1215:334:330:0',
  '1216:333:000:0 1217:334:000:0 1218:334:000:0 1219:333:000:0 1220:334:100:0 1221:334:221:2663 1222:333:210:0 1223:334:211:2663 1224:334:330:0 1225:333:000:0 1226:334:000:0 1227:334:000:0',
  '1228:333:000:0 1229:334:100:0 1230:334:221:2663 1231:333:210:0 1232:334:211:2663 1233:334:330:0 1234:333:000:0 1235:334:000:0 1236:334:000:0 1237:334:000:0 1238:333:100:0 1239:334:221:2663',
  '1240:334:210:0 1241:333:211:2663 1242:334:330:0 1243:334:000:0 1244:333:000:0 1245:334:000:0 1246:334:000:0 1247:333:100:0 1248:334:221:2663 1249:334:210:0 1250:333:211:2663 1251:334:330:0',
  '1252:334:000:0 1253:333:000:0 1254:334:000:0 1255:334:000:0 1256:333:100:0 1257:334:221:2663 1258:334:210:0 1259:333:211:2663 1260:334:330:0 1261:334:000:0 1262:333:000:0 1263:334:000:0',
  '1264:334:000:0 1265:167:100:0 1266:333:221:2663 1267:334:210:0 1268:334:211:2663 1269:333:210:0 1270:501:030:0 1271:167:000:0 1272:333:000:0 1273:334:000:0 1274:334:100:0 1275:333:221:2663',
  '1276:334:210:0 1277:334:211:2663 1278:333:210:0 1279:334:330:0 1280:334:000:0 1281:333:000:0 1282:334:000:0 1283:334:100:0 1284:333:221:2663 1285:334:210:0 1286:334:211:2663 1287:333:210:0',
  '1288:334:330:0 1289:334:000:0 1290:334:000:0 1291:333:000:0 1292:334:100:0 1293:334:221:2663 1294:333:210:0 1295:334:211:2663 1296:334:210:0 1297:333:330:0 1298:334:000:0 1299:334:000:0',
  '1300:333:000:0 1301:334:100:0 1302:334:221:2663 1303:333:210:0 1304:334:211:2663 1305:334:210:0 1306:333:330:0 1307:334:000:0 1308:334:000:0 1309:333:000:0 1310:334:000:0 1311:334:000:0',
  '1312:333:000:0 1313:334:000:0 1314:334:000:0 1315:333:000:0 1316:334:000:0 1317:334:000:0 1318:333:000:0 1319:334:000:0 1320:334:000:0 1321:500:000:0 1322:334:000:0 1323:334:000:0',
  '1324:333:000:0 1325:334:000:0 1326:334:000:0 1327:333:000:0 1328:334:000:0 1329:334:000:0 1330:333:000:0 1331:334:000:0 1332:334:000:0 1333:334:000:0 1334:333:000:0 1335:334:000:0',
].join(' ');

interface Row { frame: number; dt: number; pad: PadState; trig: number; round: boolean; timer: number }
const ROWS: Row[] = PADLAG_150_150.split(' ').map((t) => {
  const [frame, dt, ptr, timer] = t.split(':') as [string, string, string, string];   // four fields a row, as written above
  return { frame: +frame, dt: +dt / 1e4, pad: +ptr.charAt(0) as PadState, trig: +ptr.charAt(1), round: ptr.charAt(2) === '1', timer: +timer / 1e5 };
});

/** The 9mm Sub's FireWait 0.075 (record 37) x 0.8 in automatic (`FUN_005c09f0` D:L476313-476341). */
const WAIT = 0.075 * 0.8;
/** Automatic's pull limit (`FUN_005c0940` D:L476283-476310). */
const AUTO_LIMIT = 10000;

function replay(rows: readonly Row[]): { rounds: number[]; timer: Map<number, number> } {
  const k = new KitTrigger(WAIT, AUTO_LIMIT);
  const rounds: number[] = [];
  const timer = new Map<number, number>();
  for (const r of rows) {
    if (k.step(r.dt, r.pad)) rounds.push(r.frame);
    timer.set(r.frame, k.timer());
  }
  return { rounds, timer };
}

/** Presses: runs of rows whose pad is not 0 (30 of them, as the reading counts). */
function presses(): Row[][] {
  const out: Row[][] = [];
  let cur: Row[] | null = null;
  for (const r of ROWS) {
    if (r.pad !== 0) (cur ??= []).push(r);
    else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

describe('the padlag capture as derived (decoded data; the reading\'s counts)', () => {
  it('384 rows, 30 presses, 57 visible rounds; no round on any of the 31 pad-1 rows', () => {
    expect(ROWS).toHaveLength(384);
    expect(presses()).toHaveLength(30);
    expect(ROWS.filter((r) => r.round)).toHaveLength(57);
    expect(ROWS.filter((r) => r.pad === 1)).toHaveLength(31);
    expect(ROWS.filter((r) => r.pad === 1 && r.round)).toEqual([]);
  });

  it('the capture\'s timer + clock step = 0.0600 on 56 of 57 visible rounds, the exception press 7\'s folded row 1094', () => {
    const off = ROWS.filter((r) => r.round && Math.abs(r.timer + r.dt - WAIT) > 1e-3).map((r) => r.frame);
    expect(off).toEqual([1094]);
  });
});

describe('THE REPLAY: the transcribed pad layer and kit on the capture\'s own updates', () => {
  const capture = ROWS.filter((r) => r.round).map((r) => r.frame);

  it('no round on any pad-1 row', () => {
    const { rounds } = replay(ROWS);
    const pad1 = new Set(ROWS.filter((r) => r.pad === 1).map((r) => r.frame));
    expect(rounds.filter((f) => pad1.has(f))).toEqual([]);
  });

  it('the rounds land on the capture\'s rows, but for the named exceptions (press 1: 1042; press 7: 1096 for 1097)', () => {
    const { rounds } = replay(ROWS);
    const got = new Set(rounds), want = new Set(capture);
    expect(rounds.filter((f) => !want.has(f))).toEqual([1042, 1096]);    // model only: press 1's held gate, press 7's fold
    expect(capture.filter((f) => !got.has(f))).toEqual([1097]);          // capture only: press 7's fold
  });

  it('the timer after each update matches the capture\'s kit+0x81c within 1e-3, but on the exceptions\' rows', () => {
    const { timer } = replay(ROWS);
    const off = ROWS.filter((r) => Math.abs(timer.get(r.frame)! - r.timer) > 1e-3).map((r) => r.frame);
    expect(off).toEqual([1042, 1094, 1095, 1096, 1097]);
  });

  it('at a round the timer is the wait less that update\'s dt: timer + step = 0.0600 on the replay\'s rounds (>= 56 of 57)', () => {
    const { rounds, timer } = replay(ROWS);
    const byFrame = new Map(ROWS.map((r) => [r.frame, r]));
    const ok = rounds.filter((f) => Math.abs(timer.get(f)! + byFrame.get(f)!.dt - WAIT) < 1e-3);
    expect(ok.length).toBeGreaterThanOrEqual(56);
  });

  it('26 presses fire their first round at f0+1 (the first state-2 read, the second read that sees the press)', () => {
    const { rounds } = replay(ROWS);
    const got = new Set(rounds);
    const atF0plus1 = presses().filter((p) => p[0]!.pad === 1 && p[1]?.pad === 2 && got.has(p[1].frame) && capture.includes(p[1].frame));
    expect(atF0plus1).toHaveLength(26);
  });

  it('press 11: the second round folded into row 1134 (66.7 ms, pad 3) is in neither the rows\' count nor the model', () => {
    const r = ROWS.find((x) => x.frame === 1134)!;
    expect(r).toMatchObject({ pad: 3, round: false });
    expect(r.dt).toBeCloseTo(0.0667, 4);
    expect(replay(ROWS).rounds).not.toContain(1134);
  });

  it('presses 15 and 19: pad 1 on two updates (not padStep\'s output, the open point); fed the bytes, the round on the 2-read', () => {
    const { rounds } = replay(ROWS);
    for (const [a, b, fire] of [[1165, 1166, 1167], [1201, 1202, 1203]]) {
      const ra = ROWS.find((x) => x.frame === a)!, rb = ROWS.find((x) => x.frame === b)!;
      expect([ra.pad, rb.pad]).toEqual([1, 1]);
      expect(padStep(ra.pad, true)).toBe(2);                       // the step the console did not take on that update
      expect(rounds).toContain(fire);
      expect(capture).toContain(fire);
    }
  });

  it('press 7 by the reading\'s inference (not a row): 1094 split into a hidden pad-1 update and a 16.7 ms pad-2 update', () => {
    // The fold's split from the timer: 0.0501 = 0.0334 (pad 1, no round) + 0.0167 (pad 2, the round, timer 0.04328).
    const split = ROWS.flatMap((r) => r.frame === 1094
      ? [{ ...r, frame: 1093.5, dt: 0.0334, pad: 1 as PadState, round: false, timer: 0 }, { ...r, dt: 0.0167 }]
      : [r]);
    const { rounds, timer } = replay(split);
    expect(timer.get(1094)).toBeCloseTo(0.04328, 3);
    expect(rounds).toContain(1094);
    expect(rounds).toContain(1097);
    expect(rounds).not.toContain(1096);
  });

  it('the pad layer from the physical button gives the capture\'s clean four-read presses (1,2,2,2 then 3)', () => {
    let s: PadState = 0;
    const seq: PadState[] = [];
    for (const down of [true, true, true, true, false, false]) { s = padStep(s, down); seq.push(s); }
    expect(seq).toEqual([1, 2, 2, 2, 3, 0]);
    expect(seq.map(padHeld)).toEqual([false, true, true, true, false, false]);
  });
});
