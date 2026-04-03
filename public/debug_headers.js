import * as xlsx from 'xlsx';
import * as fs from 'fs';

const fileBuffer = fs.readFileSync('./public/部員名簿「ミルクティ」3月24日.xlsx');
const wb = xlsx.read(fileBuffer);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws);
console.log(JSON.stringify(Object.keys(data[0]), null, 2));
