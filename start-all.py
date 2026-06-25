import subprocess
import time
import os
import sys
import threading

# Force system console to UTF-8 output encoding if possible
if sys.stdout.encoding != 'utf-8':
    try:
        import sys
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    except Exception:
        pass

ROOT = os.path.dirname(os.path.abspath(__file__))

SERVICES = [
    {"name": "Customer Portal (3000)", "cwd": "apps/customer-portal", "cmd": "npm run dev"},
    {"name": "BPO Console (3002)", "cwd": "apps/bpo-console", "cmd": "npm run dev"},
    {"name": "Ops Console (3003)", "cwd": "apps/ops-console", "cmd": "npm run dev"},
    {"name": "Payment Orchestrator (3010)", "cwd": "services/node-services/payment-orchestrator", "cmd": "npm run dev"},
    {"name": "Incident Engine (8001)", "cwd": "services/python-services/incident-engine", "cmd": "python -m src.main"},
    {"name": "RCA Engine", "cwd": "services/python-services/rca-engine", "cmd": "python -m src.main"},
    {"name": "Reversal Engine", "cwd": "services/python-services/reversal-engine", "cmd": "python -m src.main"},
    {"name": "Agent Service (8003)", "cwd": "services/python-services/agent-service", "cmd": "python -m src.main"},
    {"name": "Blast Radius Engine", "cwd": "services/python-services/blast-radius-engine", "cmd": "python -m src.main"},
    {"name": "Prediction Engine", "cwd": "services/python-services/prediction-engine", "cmd": "python -m src.main"}
]

processes = []

def log_reader(name, stream):
    for line in iter(stream.readline, b''):
        try:
            decoded = line.decode('utf-8', errors='ignore').strip()
            # Replace common emoji / unicode symbols if system console does not support it
            decoded = decoded.encode('ascii', errors='replace').decode('ascii')
            if decoded:
                print(f"[{name}] {decoded}")
        except Exception:
            pass
    stream.close()

def main():
    print("=========================================================")
    print("      PRISM Platform Orchestrator (10 Services)          ")
    print("=========================================================")
    
    for service in SERVICES:
        name = service["name"]
        cwd_dir = os.path.join(ROOT, service["cwd"])
        cmd_str = service["cmd"]
        
        print(f"Starting {name}...")
        
        p = subprocess.Popen(
            cmd_str,
            shell=True,
            cwd=cwd_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        processes.append((name, p))
        
        t_out = threading.Thread(target=log_reader, args=(name, p.stdout), daemon=True)
        t_err = threading.Thread(target=log_reader, args=(f"{name} ERROR", p.stderr), daemon=True)
        t_out.start()
        t_err.start()
        
        time.sleep(0.5)

    print("\nAll services launched! Streaming logs below.\n")
    
    try:
        while True:
            for name, p in list(processes):
                poll = p.poll()
                if poll is not None:
                    print(f"\n[SYSTEM] Warning: {name} terminated with exit code {poll}")
                    processes.remove((name, p))
            time.sleep(2)
    except KeyboardInterrupt:
        print("\nShutting down all services...")
        for name, p in processes:
            print(f"Terminating {name}...")
            p.terminate()
            p.wait()
        print("Shutdown complete.")

if __name__ == "__main__":
    main()
