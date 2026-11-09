# win32.ps1 —— 真机验收用的 Win32 封装（dot-source 使用，不做任何业务判断）
#
# 只做四件事：找窗口、读窗口矩形/状态、发真实鼠标键盘事件、读写安装器子控件。
# 坐标一律是物理像素：脚本入口先调用 [Jx.Win]::MakeDpiAware()，否则高 DPI 下
# GetWindowRect 会返回被系统虚拟化过的逻辑坐标，和 UIA 的矩形对不上。

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace Jx
{
    internal static class Native
    {
        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

        public delegate bool EnumProc(IntPtr hwnd, IntPtr param);

        [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr param);
        [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr param);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder text, int max);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder text, int max);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT rect);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
        [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
        [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
        [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
        [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr parent, int id);
        [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
        [DllImport("user32.dll")] public static extern IntPtr SendMessageW(IntPtr h, uint msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr h, uint msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
        [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, IntPtr extra);
        [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, IntPtr extra);
        [DllImport("user32.dll")] public static extern bool SystemParametersInfoW(uint action, uint param, out RECT rect, uint winIni);
    }

    public struct WindowRect
    {
        public int Left, Top, Right, Bottom;
        public int Width { get { return Right - Left; } }
        public int Height { get { return Bottom - Top; } }
        public override string ToString()
        {
            return string.Format("{0},{1} {2}x{3}", Left, Top, Width, Height);
        }
    }

    public struct ChildInfo
    {
        public long Handle;
        public string Class;
        public string Text;
        public int Id;
        public bool Enabled;
        public override string ToString()
        {
            return string.Format("#{0} [{1}] id={2} enabled={3} \"{4}\"", Handle, Class, Id, Enabled, Text);
        }
    }

    public static class Win
    {
        const uint WM_CLOSE = 0x0010;
        const uint WM_COMMAND = 0x0111;
        const uint BM_CLICK = 0x00F5;
        const uint SPI_GETWORKAREA = 0x0030;
        const uint SWP_NOZORDER = 0x0004;
        const uint SWP_NOACTIVATE = 0x0010;

        public static void MakeDpiAware()
        {
            try { Native.SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        }

        static string ReadText(IntPtr h, bool className)
        {
            var sb = new StringBuilder(1024);
            if (className) Native.GetClassNameW(h, sb, sb.Capacity);
            else Native.GetWindowTextW(h, sb, sb.Capacity);
            return sb.ToString();
        }

        public static string Title(IntPtr h) { return ReadText(h, false); }

        public static IntPtr FindTopWindow(int pid, string titleContains)
        {
            IntPtr found = IntPtr.Zero;
            Native.EnumWindows(delegate (IntPtr h, IntPtr p)
            {
                uint windowPid;
                Native.GetWindowThreadProcessId(h, out windowPid);
                if (windowPid != (uint)pid) return true;
                if (!Native.IsWindowVisible(h)) return true;
                string title = Title(h);
                if (title.Length == 0) return true;
                if (titleContains != null && title.IndexOf(titleContains, StringComparison.Ordinal) < 0) return true;
                found = h;
                return false;
            }, IntPtr.Zero);
            return found;
        }

        public static WindowRect Rect(IntPtr h)
        {
            Native.RECT r;
            Native.GetWindowRect(h, out r);
            var window = new WindowRect();
            window.Left = r.Left; window.Top = r.Top; window.Right = r.Right; window.Bottom = r.Bottom;
            return window;
        }

        public static WindowRect WorkArea(IntPtr h)
        {
            Native.RECT r;
            Native.SystemParametersInfoW(SPI_GETWORKAREA, 0, out r, 0);
            var area = new WindowRect();
            area.Left = r.Left; area.Top = r.Top; area.Right = r.Right; area.Bottom = r.Bottom;
            return area;
        }

        public static bool IsMaximized(IntPtr h) { return Native.IsZoomed(h); }

        public static void Focus(IntPtr h)
        {
            Native.ShowWindow(h, 9); // SW_RESTORE
            Native.SetForegroundWindow(h);
            Thread.Sleep(200);
        }

        public static void Restore(IntPtr h) { Native.ShowWindow(h, 9); Thread.Sleep(200); }

        public static void Place(IntPtr h, int x, int y, int width, int height)
        {
            Native.SetWindowPos(h, IntPtr.Zero, x, y, width, height, SWP_NOZORDER | SWP_NOACTIVATE);
            Thread.Sleep(200);
        }

        public static void SendClose(IntPtr h) { Native.PostMessageW(h, WM_CLOSE, IntPtr.Zero, IntPtr.Zero); }

        // ---- 鼠标：走系统输入队列，Explorer 会因此发起真正的 OLE 拖放 ----
        public static void MoveTo(int x, int y) { Native.SetCursorPos(x, y); }

        public static void LeftDown() { Native.mouse_event(0x0002, 0, 0, 0, IntPtr.Zero); }

        public static void LeftUp() { Native.mouse_event(0x0004, 0, 0, 0, IntPtr.Zero); }

        public static void ClickAt(int x, int y)
        {
            MoveTo(x, y);
            Thread.Sleep(80);
            LeftDown();
            Thread.Sleep(40);
            LeftUp();
        }

        public static void DoubleClickAt(int x, int y)
        {
            MoveTo(x, y);
            Thread.Sleep(100);
            LeftDown(); Thread.Sleep(30); LeftUp();
            Thread.Sleep(90);
            LeftDown(); Thread.Sleep(30); LeftUp();
        }

        public static void Drag(int x0, int y0, int x1, int y1, int steps, int stepMs)
        {
            MoveTo(x0, y0);
            Thread.Sleep(150);
            LeftDown();
            Thread.Sleep(150);
            for (int i = 1; i <= steps; i += 1)
            {
                int x = x0 + (x1 - x0) * i / steps;
                int y = y0 + (y1 - y0) * i / steps;
                MoveTo(x, y);
                Thread.Sleep(stepMs);
            }
            Thread.Sleep(250);
            LeftUp();
        }

        // ---- 键盘 ----
        public static void CtrlKey(byte vk)
        {
            Native.keybd_event(0xA2, 0, 0, IntPtr.Zero);
            Thread.Sleep(40);
            Native.keybd_event(vk, 0, 0, IntPtr.Zero);
            Thread.Sleep(60);
            Native.keybd_event(vk, 0, 2, IntPtr.Zero);
            Thread.Sleep(40);
            Native.keybd_event(0xA2, 0, 2, IntPtr.Zero);
        }

        // ---- 安装器子控件（NSIS 是标准 Win32 控件，不需要 UIA） ----
        public static ChildInfo[] Children(IntPtr parent)
        {
            var list = new List<ChildInfo>();
            Native.EnumChildWindows(parent, delegate (IntPtr h, IntPtr p)
            {
                var info = new ChildInfo();
                info.Handle = h.ToInt64();
                info.Class = ReadText(h, true);
                info.Text = ReadText(h, false);
                info.Id = Native.GetDlgCtrlID(h);
                info.Enabled = Native.IsWindowEnabled(h);
                list.Add(info);
                return true;
            }, IntPtr.Zero);
            return list.ToArray();
        }

        public static IntPtr DlgItem(IntPtr parent, int id) { return Native.GetDlgItem(parent, id); }

        public static string TextOf(IntPtr h) { return ReadText(h, false); }

        public static bool Enabled(IntPtr h) { return Native.IsWindowEnabled(h); }

        public static void ClickControl(IntPtr h) { Native.SendMessageW(h, BM_CLICK, IntPtr.Zero, IntPtr.Zero); Thread.Sleep(250); }

        public static void Command(IntPtr parent, int id) { Native.PostMessageW(parent, WM_COMMAND, new IntPtr(id), IntPtr.Zero); }
    }
}
'@
