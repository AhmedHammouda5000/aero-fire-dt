"""Simulated conventional fire panel (ECS/SSI) exposing its relay states over Modbus TCP.

Holding registers (read with function code 03):
  40001 FEU ZONE A · 40002 FEU ZONE B · 40003 FEU ZONE C · 40004 ALARME GÉNÉRALE · 40005 DÉRANGEMENT
The states replay scenario A (real wood fire) from app/data/scenarios_data.js.
Pure Python (no dependency), minimal Modbus TCP: FC 03 only; any other function code is
answered with exception 01 (illegal function), as a read-only gateway map would be.

Usage: python edge/panel_sim.py [--port 5020] [--speed 10]
"""
from __future__ import annotations

import argparse
import json
import socket
import socketserver
import struct
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_scenario(sid: str = "A") -> dict:
    js = (ROOT / "app" / "data" / "scenarios_data.js").read_text(encoding="utf-8")
    data = json.loads(js[js.index("["): js.rindex("]") + 1])
    return next(s for s in data if s["id"] == sid)


class PanelState:
    def __init__(self, scenario: dict, speed: float):
        self.s, self.speed, self.t0 = scenario, speed, time.time()
        self.lock = threading.Lock()

    def registers(self) -> list[int]:
        s = self.s
        i = min(int((time.time() - self.t0) * self.speed / s["dt"]), len(s["t"]) - 1)
        z = s["ssi"]["zones"]
        return [z["A"][i], z["B"][i], z["C"][i], s["ssi"]["fire"][i], s["ssi"]["fault"][i]]


def make_handler(state: PanelState):
    class Handler(socketserver.BaseRequestHandler):
        def handle(self):
            while True:
                head = self.request.recv(7)
                if len(head) < 7:
                    return
                tid, pid, length, uid = struct.unpack(">HHHB", head)
                pdu = self.request.recv(length - 1)
                fc = pdu[0]
                if fc == 3:
                    addr, count = struct.unpack(">HH", pdu[1:5])
                    regs = state.registers()
                    vals = [regs[a] if 0 <= a < len(regs) else 0 for a in range(addr, addr + count)]
                    body = struct.pack(">BB", 3, 2 * count) + b"".join(struct.pack(">H", v) for v in vals)
                else:  # writes (05, 06, 15, 16) or anything else: illegal function
                    body = struct.pack(">BB", fc | 0x80, 0x01)
                self.request.sendall(struct.pack(">HHHB", tid, pid, len(body) + 1, uid) + body)
    return Handler


def serve(port: int = 5020, speed: float = 10.0, background: bool = False):
    state = PanelState(load_scenario("A"), speed)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", port), make_handler(state))
    if background:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        return srv
    print(f"Simulated panel on 127.0.0.1:{port} (scenario A, x{speed})")
    srv.serve_forever()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=5020)
    ap.add_argument("--speed", type=float, default=10.0)
    a = ap.parse_args()
    serve(a.port, a.speed)
