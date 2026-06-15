import axios from 'axios';
import { parse } from 'node-html-parser';

export async function extractIpLocation(ip: string) {
  if (ip === '127.0.0.1') {
    try {
      const check = await axios.get('https://api64.ipify.org/?format=json');
      ip = check.data.ip;
    } catch {
      // ignore
    }
  }

  const ipInfo: { ip: string; region: string; country: string } = {
    ip,
    region: '',
    country: '',
  };

  try {
    const url = `https://check-host.net/ip-info?host=${ip}`;
    const response = await axios.get(url);
    const root = parse(response.data as string);

    const tds = root.querySelectorAll('td');

    for (const [index, td] of tds.entries()) {
      if (td.textContent.includes('Region') && ipInfo.region.length === 0) {
        ipInfo.region = tds[index + 1].textContent.trim();
      }

      if (td.textContent.includes('Country') && ipInfo.country.length === 0) {
        ipInfo.country = tds[index + 1].textContent.trim().replaceAll('\n', '');
      }
    }
  } catch (error) {
    console.error('Error extracting IP location:', error);
  }

  return ipInfo;
}
