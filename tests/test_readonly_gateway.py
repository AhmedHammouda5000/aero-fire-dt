"""The gateway reads the simulated panel and can never write to it.
Run: python tests/test_readonly_gateway.py"""
import socket
import struct
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from edge.gateway import ReadOnlyModbusClient, WriteForbidden
from edge.panel_sim import serve

srv = serve(port=5031, speed=600.0, background=True)   # fast replay: fire relay after ~1 s
c = ReadOnlyModbusClient(port=5031)
first = c.read_holding(0, 5)
assert len(first) == 5
time.sleep(1.5)
later = c.read_holding(0, 5)
assert later[0] == 1 and later[3] == 1, later   # zone A fire + general alarm latched

# 1) the gateway refuses to even send a write
try:
    c.write_register(0, 0)          # attempt to reset zone A
    raise AssertionError("write was sent!")
except WriteForbidden as e:
    print("gateway: write refused before sending ->", e)
c.sock.close()

# 2) a raw write PDU sent to the read-only register map gets exception 01 (illegal function)
with socket.create_connection(("127.0.0.1", 5031), timeout=3) as s:
    pdu = struct.pack(">BHH", 6, 0, 0)
    s.sendall(struct.pack(">HHHB", 1, 0, len(pdu) + 1, 1) + pdu)
    resp = s.recv(64)
    fc, code = resp[7], resp[8]
    assert fc == 0x86 and code == 0x01, resp
    print("panel map: raw FC06 answered with exception 01 (illegal function)")

print("reads:", first, "->", later)
print("OK: gateway is read-only")
srv.shutdown()
srv.server_close()
