echo "env: $(env | tr '\n' ' ')"
echo "ls /run: $(ls -A /run 2>&1)"; echo "ls HOME: $(ls -A $HOME 2>&1 | tr '\n' ' ')"
ls -l /run/user/1002/bus 2>&1 | head -1
python3 -c "
import socket,os
for p in ['/run/user/1002/bus','/tmp/.X11-unix/X0']:
    s=socket.socket(socket.AF_UNIX); 
    try: s.connect(p); print('CONNECTED',p)
    except Exception as e: print('blocked',p,type(e).__name__)
try: socket.create_connection(('1.1.1.1',53),2); print('NET OPEN')
except Exception as e: print('net blocked',type(e).__name__)
s=socket.socket(socket.AF_UNIX)
try: s.connect('\0/tmp/.X11-unix/X0'); print('ABSTRACT X11 CONNECTED')
except Exception as e: print('abstract X11 blocked',type(e).__name__)
" 2>&1
echo "ls /root: $(ls -ld /root 2>&1)"; echo "ls /run/user: $(ls -ld /run/user 2>&1)"; echo "ls /sys: $(ls -ld /sys 2>&1)"; touch /newfile 2>&1
