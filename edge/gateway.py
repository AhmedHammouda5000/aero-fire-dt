"""Aero-Fire DT read-only gateway client.

The gateway can only READ the panel: the only function codes it is able to send are the
Modbus read codes 01-04. Write codes (05, 06, 15, 16) are refused in code before anything is
sent — on site this is doubled by opto-isolated relay inputs / a one-way firewall (data diode).

Usage: python edge/gateway.py [--port 5020] [--polls 20]
"""
from __future__ import annotations

import argparse
import socket
import struct
import time

READ_ONLY_CODES = {1, 2, 3, 4}
NAMES = ["FEU A", "FEU B", "FEU C", "GÉNÉRAL", "DÉRANGEMENT"]


class WriteForbidden(Exception):
    pass


class ReadOnlyModbusClient:
    def __init__(self, host: str = "127.0.0.1", port: int = 5020):
        self.sock = socket.create_connection((host, port), timeout=3)
        self.tid = 0

    def _request(self, fc: int, payload: bytes) -> bytes:
        if fc not in READ_ONLY_CODES:
            raise WriteForbidden(f"function code {fc} refused: Aero-Fire DT is read-only by design")
        self.tid = (self.tid + 1) % 65536
        pdu = struct.pack(">B", fc) + payload
        self.sock.sendall(struct.pack(">HHHB", self.tid, 0, len(pdu) + 1, 1) + pdu)
        head = self.sock.recv(7)
        _, _, length, _ = struct.unpack(">HHHB", head)
        return self.sock.recv(length - 1)

    def read_holding(self, addr: int, count: int) -> list[int]:
        resp = self._request(3, struct.pack(">HH", addr, count))
        if resp[0] & 0x80:
            raise IOError(f"modbus exception {resp[1]}")
        n = resp[1] // 2
        return list(struct.unpack(">" + "H" * n, resp[2:2 + 2 * n]))

    def write_register(self, addr: int, value: int):  # kept only to demonstrate the refusal
        return self._request(6, struct.pack(">HH", addr, value))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=5020)
    ap.add_argument("--polls", type=int, default=20)
    a = ap.parse_args()
    c = ReadOnlyModbusClient(port=a.port)
    prev = None
    for _ in range(a.polls):
        regs = c.read_holding(0, 5)
        line = " · ".join(f"{n}={v}" for n, v in zip(NAMES, regs))
        print("FC03 READ 40001-40005 →", line, "  ← CHANGEMENT" if prev and regs != prev else "")
        prev = regs
        time.sleep(1)


if __name__ == "__main__":
    main()
