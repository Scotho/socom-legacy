"""Windows-only desktop screening; neither Xbox emulation nor a GPU-memory cap.

The fresh process starts suspended and enters the job before executing. Limits
cover job committed memory, including inherited child jobs, with no breakaway.
https://learn.microsoft.com/windows/win32/procthread/job-objects
https://learn.microsoft.com/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information
"""
import ctypes as c
from ctypes import wintypes as w
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time

if sys.platform != 'win32':
    raise SystemExit('This instrument requires Windows')
k = c.WinDLL('kernel32', use_last_error=True)
ps = c.WinDLL('psapi', use_last_error=True)


class Basic(c.Structure):
    _fields_ = [('processTime', c.c_longlong), ('jobTime', c.c_longlong), ('flags', w.DWORD),
                ('minimum', c.c_size_t), ('maximum', c.c_size_t), ('active', w.DWORD),
                ('affinity', c.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]


class IO(c.Structure):
    _fields_ = [(name, c.c_ulonglong) for name in ['readOps', 'writeOps', 'otherOps', 'readBytes', 'writeBytes', 'otherBytes']]


class Extended(c.Structure):
    _fields_ = [('basic', Basic), ('io', IO), ('processLimit', c.c_size_t), ('jobLimit', c.c_size_t),
                ('peakProcess', c.c_size_t), ('peakJob', c.c_size_t)]


class Pids(c.Structure):
    _fields_ = [('assigned', w.DWORD), ('count', w.DWORD), ('ids', c.c_size_t * 128)]


class Memory(c.Structure):
    _fields_ = [('cb', w.DWORD), ('faults', w.DWORD)] + [(name, c.c_size_t) for name in
        ['peakWs', 'ws', 'peakPaged', 'paged', 'peakNonpaged', 'nonpaged', 'pagefile', 'peakPagefile', 'private']]


class Startup(c.Structure):
    _fields_ = [('cb', w.DWORD), ('reserved', w.LPWSTR), ('desktop', w.LPWSTR), ('title', w.LPWSTR),
                ('x', w.DWORD), ('y', w.DWORD), ('xs', w.DWORD), ('ys', w.DWORD), ('xc', w.DWORD),
                ('yc', w.DWORD), ('fill', w.DWORD), ('flags', w.DWORD), ('show', w.WORD),
                ('reserved2size', w.WORD), ('reserved2', c.c_void_p), ('stdin', w.HANDLE),
                ('stdout', w.HANDLE), ('stderr', w.HANDLE)]


class Process(c.Structure):
    _fields_ = [('process', w.HANDLE), ('thread', w.HANDLE), ('pid', w.DWORD), ('tid', w.DWORD)]


k.CreateJobObjectW.argtypes = [c.c_void_p, w.LPCWSTR]; k.CreateJobObjectW.restype = w.HANDLE
k.SetInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]
k.QueryInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD, c.c_void_p]
k.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
k.TerminateJobObject.argtypes = [w.HANDLE, w.UINT]
k.CloseHandle.argtypes = [w.HANDLE]
k.CreateProcessW.argtypes = [w.LPCWSTR, w.LPWSTR, c.c_void_p, c.c_void_p, w.BOOL, w.DWORD,
                            c.c_void_p, w.LPCWSTR, c.POINTER(Startup), c.POINTER(Process)]
k.ResumeThread.argtypes = [w.HANDLE]; k.ResumeThread.restype = w.DWORD
k.TerminateProcess.argtypes = [w.HANDLE, w.UINT]
k.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]; k.WaitForSingleObject.restype = w.DWORD
k.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]; k.OpenProcess.restype = w.HANDLE
ps.GetProcessMemoryInfo.argtypes = [w.HANDLE, c.c_void_p, w.DWORD]


def check(result):
    if not result:
        raise c.WinError(c.get_last_error())


def emit(record):
    print(json.dumps(record), flush=True)


class MemoryJob:
    def __init__(self, cap_mib):
        self.job = k.CreateJobObjectW(None, None)
        check(self.job)
        self.process = Process()
        self.peak = 0
        try:
            limits = Extended()
            limits.basic.flags = 0x200 | 0x2000  # JOB_MEMORY | KILL_ON_JOB_CLOSE
            limits.jobLimit = cap_mib * 1024**2
            check(k.SetInformationJobObject(self.job, 9, c.byref(limits), c.sizeof(limits)))
            actual = self.limits()
            if actual.basic.flags != limits.basic.flags or actual.jobLimit != limits.jobLimit:
                raise RuntimeError('Job limit readback differs from the requested limit')
        except BaseException:
            self.close()
            raise

    def limits(self):
        usage = Extended()
        check(k.QueryInformationJobObject(self.job, 9, c.byref(usage), c.sizeof(usage), None))
        self.peak = max(self.peak, usage.peakJob)
        return usage

    def members(self):
        members = Pids()
        check(k.QueryInformationJobObject(self.job, 3, c.byref(members), c.sizeof(members), None))
        if members.count > 128 or members.count != members.assigned:
            raise RuntimeError('Incomplete job membership report')
        return list(members.ids[:members.count])

    def start(self, command):
        startup = Startup(); startup.cb = c.sizeof(startup); startup.flags = 1; startup.show = 0
        check(k.CreateProcessW(command[0], c.create_unicode_buffer(subprocess.list2cmdline(command)),
              None, None, False, 0x4 | 0x08000000, None, None, c.byref(startup), c.byref(self.process)))
        if not k.AssignProcessToJobObject(self.job, self.process.process):
            error = c.get_last_error()
            k.TerminateProcess(self.process.process, 1)  # Only the fresh, still-suspended process we own.
            k.WaitForSingleObject(self.process.process, 5000)
            raise c.WinError(error)
        if k.ResumeThread(self.process.thread) == 0xffffffff:
            raise c.WinError(c.get_last_error())

    def sample(self):
        ids = self.members()
        usage = self.limits()
        private = 0; observed = 0
        for pid in ids:
            handle = k.OpenProcess(0x1000, False, pid)
            if not handle:
                continue  # Membership can change before OpenProcess.
            try:
                info = Memory(); info.cb = c.sizeof(info)
                if ps.GetProcessMemoryInfo(handle, c.byref(info), c.sizeof(info)):
                    private += info.private; observed += 1
            finally:
                k.CloseHandle(handle)
        return {'event': 'sample', 'time': int(time.time() * 1000), 'privateBytes': private,
                'jobPeakBytes': self.peak, 'ids': ids, 'observed': observed,
                'limitBytes': usage.jobLimit, 'limitFlags': usage.basic.flags}

    def close(self):
        if not self.job:
            return
        try:
            self.limits()
            check(k.TerminateJobObject(self.job, 0))
            deadline = time.monotonic() + 5
            while self.members():
                if time.monotonic() >= deadline:
                    raise RuntimeError('Owned job children did not exit')
                time.sleep(0.05)
        finally:
            k.CloseHandle(self.job); self.job = None
            if self.process.process:
                k.CloseHandle(self.process.process)
            if self.process.thread:
                k.CloseHandle(self.process.thread)


def allocation_probe(path):
    k.VirtualAlloc.argtypes = [c.c_void_p, c.c_size_t, w.DWORD, w.DWORD]
    k.VirtualAlloc.restype = c.c_void_p
    k.VirtualFree.argtypes = [c.c_void_p, c.c_size_t, w.DWORD]
    small = k.VirtualAlloc(None, 8 * 1024**2, 0x3000, 4)
    large = k.VirtualAlloc(None, 128 * 1024**2, 0x3000, 4)
    result = {'smallCommitSucceeded': bool(small), 'largeCommitRefused': not large}
    if large: k.VirtualFree(large, 0, 0x8000)
    if small: k.VirtualFree(small, 0, 0x8000)
    with Path(path).open('x', encoding='utf-8') as out:
        json.dump(result, out)
    time.sleep(30)  # Parent verifies membership, then terminates only this owned job.


def verify(output):
    output.mkdir(parents=True, exist_ok=True)
    path = Path(tempfile.mkdtemp(prefix='control-', dir=output)) / 'allocation.json'
    job = MemoryJob(64)
    try:
        job.start([sys.executable, str(Path(__file__).resolve()), '--allocation-probe', str(path)])
        deadline = time.monotonic() + 15
        while not path.exists():
            if time.monotonic() >= deadline:
                raise RuntimeError('Allocation control did not finish')
            time.sleep(0.05)
        # Child writes then closes before sleeping; retry a still-in-progress write.
        while True:
            try: result = json.loads(path.read_text(encoding='utf-8')); break
            except json.JSONDecodeError:
                if time.monotonic() >= deadline: raise
                time.sleep(0.01)
        if result != {'smallCommitSucceeded': True, 'largeCommitRefused': True}:
            raise RuntimeError('Allocation control failed: ' + json.dumps(result))
        assert job.process.pid in job.members()
        before = job.sample()
    finally:
        job.close()
    emit({'event': 'control-passed', 'capMiB': 64, **result,
          'assignedBeforeExecution': True, 'cleaned': True, 'peakBytes': before['jobPeakBytes'],
          'sampledPrivateBytes': before['privateBytes'], 'limitBytes': before['limitBytes']})


def browser(cap, port, output, timeout_seconds=300):
    if not 512 <= cap <= 4096 or not 5600 <= port <= 5699:
        raise ValueError('Expected 512..4096 MiB and an owned port in 5600..5699')
    if not 30 <= timeout_seconds <= 1800:
        raise ValueError('Expected a 30..1800 second owned-job deadline')
    output.mkdir(parents=True, exist_ok=True)
    profile = tempfile.mkdtemp(prefix='edge-', dir=output)
    executable = Path(os.environ['PROGRAMFILES(X86)']) / 'Microsoft/Edge/Application/msedge.exe'
    if not executable.is_file(): raise RuntimeError('Microsoft Edge executable is unavailable')
    job = MemoryJob(cap)
    stop = threading.Event()
    try:
        job.start([str(executable), '--headless=new', '--no-first-run', '--no-default-browser-check',
            '--remote-debugging-port=' + str(port), '--remote-debugging-address=127.0.0.1',
            '--use-angle=d3d11', '--disable-background-networking', '--enable-precise-memory-info',
            '--window-size=1280,720', '--user-data-dir=' + profile, 'about:blank'])
        def read_stop():
            sys.stdin.readline(); stop.set()
        threading.Thread(target=read_stop, daemon=True).start()
        actual = job.limits()
        emit({'event': 'ready', 'pid': job.process.pid, 'capMiB': cap, 'limitBytes': actual.jobLimit,
              'limitFlags': actual.basic.flags, 'assignedBeforeExecution': True,
              'timeoutSeconds': timeout_seconds})
        # Independent of the driver/CDP, including a bounded longer session.
        deadline = time.monotonic() + timeout_seconds
        while not stop.is_set():
            emit(job.sample())
            if k.WaitForSingleObject(job.process.process, 0) == 0:
                break
            if time.monotonic() >= deadline:
                raise RuntimeError('Owned browser exceeded the instrument time bound')
            stop.wait(0.5)
    finally:
        job.close()
        emit({'event': 'stopped', 'cleaned': True, 'peakBytes': job.peak})


if __name__ == '__main__':
    if sys.argv[1] == '--allocation-probe': allocation_probe(sys.argv[2])
    elif sys.argv[1] == '--verify': verify(Path(sys.argv[2]))
    else: browser(int(sys.argv[1]), int(sys.argv[2]), Path(sys.argv[3]), int(sys.argv[4]) if len(sys.argv) > 4 else 300)
