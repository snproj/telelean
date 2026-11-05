import os, socket
p = f"/run/user/{os.getuid()}/bus"
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
try:
    s.connect(p)              # connect only; send NOTHING
    print("DBUS_CONNECT: SUCCEEDED (AF_UNIX reachable despite --unshare-all/net)")
    s.close()
except Exception as e:
    print("DBUS_CONNECT: failed ->", type(e).__name__, e)
