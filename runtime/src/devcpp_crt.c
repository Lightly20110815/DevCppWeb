/* Runtime support linked into every program compiled by the web version of Dev-C++.
   The console itself lives in the browser; these functions talk to it through imports
   from the "devcpp" module (implemented in src/compiler/runner.worker.ts). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <time.h>
#include <windows.h>
#include <conio.h>

#define IMPORT(name) __attribute__((import_module("devcpp"), import_name(#name)))

IMPORT(system) int dc_system(const char *cmd, int len);
IMPORT(sleep) void dc_sleep(unsigned ms);
IMPORT(getch) int dc_getch(int echo);
IMPORT(kbhit) int dc_kbhit(void);
IMPORT(ungetch) void dc_ungetch(int c);
IMPORT(set_attr) void dc_set_attr(int attr);
IMPORT(get_attr) int dc_get_attr(void);
IMPORT(gotoxy) void dc_gotoxy(int x, int y);
IMPORT(get_cursor) int dc_get_cursor(void);
IMPORT(screen_size) int dc_screen_size(void);
IMPORT(messagebox) int dc_messagebox(const char *text, int tlen, const char *cap, int clen, int type);
IMPORT(set_title) void dc_set_title(const char *t, int len);
IMPORT(get_title) int dc_get_title(char *buf, int size);
IMPORT(keystate) int dc_keystate(int vk);
IMPORT(cursor_visible) void dc_cursor_visible(int visible, int size);
IMPORT(cursor_info) int dc_cursor_info(void);
IMPORT(beep) void dc_beep(int freq, int dur);
IMPORT(fill) void dc_fill(int ch, int attr, int count, int x, int y, int mode);
IMPORT(exe_path) int dc_exe_path(char *buf, int size);
IMPORT(now_ms) double dc_now_ms(void);
IMPORT(perf_now) double dc_perf_now(void);
IMPORT(local_offset) int dc_local_offset(void);

/* Windows consoles do not buffer stdout, make sure prompts appear before blocking calls */
__attribute__((constructor)) static void devcpp_init(void) {
  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);
}

static void flush_all(void) { fflush(stdout); fflush(stderr); }

int system(const char *command) {
  flush_all();
  if (!command) return 1; /* a command processor is available */
  return dc_system(command, (int)strlen(command));
}

/* ------------------------------------------------------------------ conio */
int _getch(void) { flush_all(); return dc_getch(0); }
int _getche(void) { flush_all(); return dc_getch(1); }
int _kbhit(void) { flush_all(); return dc_kbhit(); }
int _putch(int c) { putchar(c); fflush(stdout); return c; }
int _ungetch(int c) { dc_ungetch(c); return c; }
int _cputs(const char *s) { fputs(s, stdout); fflush(stdout); return 0; }
char *_cgets(char *buf) {
  int max = (unsigned char)buf[0], n = 0;
  flush_all();
  for (;;) {
    int c = dc_getch(1);
    if (c == '\r' || c == '\n') break;
    if (c == 8) { if (n > 0) n--; continue; }
    if (n < max - 1) buf[2 + n++] = (char)c;
  }
  buf[1] = (char)n;
  buf[2 + n] = 0;
  return buf + 2;
}
int _cprintf(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vprintf(fmt, ap);
  va_end(ap);
  fflush(stdout);
  return r;
}
int getch(void) { return _getch(); }
int getche(void) { return _getche(); }
int kbhit(void) { return _kbhit(); }
int putch(int c) { return _putch(c); }
int ungetch(int c) { return _ungetch(c); }
int cputs(const char *s) { return _cputs(s); }
char *cgets(char *b) { return _cgets(b); }
int cprintf(const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  int r = vprintf(fmt, ap);
  va_end(ap);
  fflush(stdout);
  return r;
}

/* ------------------------------------------------------------------ kernel32 */
static DWORD last_error = 0;

void WINAPI Sleep(DWORD ms) { flush_all(); dc_sleep(ms); }
DWORD WINAPI GetTickCount(void) { return (DWORD)(unsigned long long)dc_perf_now(); }
ULONGLONG WINAPI GetTickCount64(void) { return (ULONGLONG)dc_perf_now(); }
BOOL WINAPI QueryPerformanceCounter(LARGE_INTEGER *c) {
  c->QuadPart = (LONGLONG)(dc_perf_now() * 10000.0);
  return TRUE;
}
BOOL WINAPI QueryPerformanceFrequency(LARGE_INTEGER *f) {
  f->QuadPart = 10000000LL;
  return TRUE;
}
static void fill_systemtime(LPSYSTEMTIME st, double ms) {
  time_t t = (time_t)(ms / 1000.0);
  struct tm tmv;
  gmtime_r(&t, &tmv);
  st->wYear = (WORD)(tmv.tm_year + 1900);
  st->wMonth = (WORD)(tmv.tm_mon + 1);
  st->wDayOfWeek = (WORD)tmv.tm_wday;
  st->wDay = (WORD)tmv.tm_mday;
  st->wHour = (WORD)tmv.tm_hour;
  st->wMinute = (WORD)tmv.tm_min;
  st->wSecond = (WORD)tmv.tm_sec;
  st->wMilliseconds = (WORD)((long long)ms % 1000);
}
void WINAPI GetLocalTime(LPSYSTEMTIME st) { fill_systemtime(st, dc_now_ms() - dc_local_offset() * 60000.0); }
void WINAPI GetSystemTime(LPSYSTEMTIME st) { fill_systemtime(st, dc_now_ms()); }
void WINAPI ExitProcess(UINT code) { flush_all(); exit((int)code); }
DWORD WINAPI GetCurrentProcessId(void) { return 4242; }
DWORD WINAPI GetLastError(void) { return last_error; }
BOOL WINAPI Beep(DWORD f, DWORD d) { flush_all(); dc_beep((int)f, (int)d); return TRUE; }
HANDLE WINAPI GetStdHandle(DWORD n) { return (HANDLE)(intptr_t)(n == STD_INPUT_HANDLE ? 3 : n == STD_OUTPUT_HANDLE ? 7 : 11); }
BOOL WINAPI CloseHandle(HANDLE h) { (void)h; return TRUE; }
BOOL WINAPI SetConsoleTextAttribute(HANDLE h, WORD a) { (void)h; flush_all(); dc_set_attr(a); return TRUE; }
BOOL WINAPI SetConsoleCursorPosition(HANDLE h, COORD c) { (void)h; flush_all(); dc_gotoxy(c.X, c.Y); return TRUE; }
BOOL WINAPI GetConsoleScreenBufferInfo(HANDLE h, PCONSOLE_SCREEN_BUFFER_INFO i) {
  (void)h;
  flush_all();
  int size = dc_screen_size();
  int cur = dc_get_cursor();
  int cols = size & 0xffff, rows = (size >> 16) & 0xffff;
  i->dwSize.X = (SHORT)cols;
  i->dwSize.Y = 9001;
  i->dwCursorPosition.X = (SHORT)(cur & 0xffff);
  i->dwCursorPosition.Y = (SHORT)((cur >> 16) & 0xffff);
  i->wAttributes = (WORD)dc_get_attr();
  i->srWindow.Left = 0;
  i->srWindow.Top = 0;
  i->srWindow.Right = (SHORT)(cols - 1);
  i->srWindow.Bottom = (SHORT)(rows - 1);
  i->dwMaximumWindowSize.X = (SHORT)cols;
  i->dwMaximumWindowSize.Y = (SHORT)rows;
  return TRUE;
}
BOOL WINAPI SetConsoleCursorInfo(HANDLE h, const CONSOLE_CURSOR_INFO *i) { (void)h; dc_cursor_visible(i->bVisible, (int)i->dwSize); return TRUE; }
BOOL WINAPI GetConsoleCursorInfo(HANDLE h, PCONSOLE_CURSOR_INFO i) {
  (void)h;
  int v = dc_cursor_info();
  i->bVisible = v & 1;
  i->dwSize = (DWORD)(v >> 1);
  return TRUE;
}
BOOL WINAPI SetConsoleTitleA(LPCSTR t) { dc_set_title(t, (int)strlen(t)); return TRUE; }
DWORD WINAPI GetConsoleTitleA(LPSTR b, DWORD n) { return (DWORD)dc_get_title(b, (int)n); }
BOOL WINAPI FillConsoleOutputCharacterA(HANDLE h, CHAR c, DWORD n, COORD at, LPDWORD w) {
  (void)h;
  flush_all();
  dc_fill((unsigned char)c, 0, (int)n, at.X, at.Y, 1);
  if (w) *w = n;
  return TRUE;
}
BOOL WINAPI FillConsoleOutputAttribute(HANDLE h, WORD a, DWORD n, COORD at, LPDWORD w) {
  (void)h;
  flush_all();
  dc_fill(0, a, (int)n, at.X, at.Y, 2);
  if (w) *w = n;
  return TRUE;
}
BOOL WINAPI WriteConsoleA(HANDLE h, const void *buf, DWORD n, LPDWORD w, LPVOID r) {
  (void)h;
  (void)r;
  fwrite(buf, 1, n, stdout);
  fflush(stdout);
  if (w) *w = n;
  return TRUE;
}
BOOL WINAPI SetConsoleOutputCP(UINT cp) { (void)cp; return TRUE; }
BOOL WINAPI SetConsoleCP(UINT cp) { (void)cp; return TRUE; }
UINT WINAPI GetConsoleOutputCP(void) { return 65001; }
HWND WINAPI GetConsoleWindow(void) { return (HWND)(intptr_t)1; }
DWORD WINAPI GetModuleFileNameA(HMODULE m, LPSTR b, DWORD n) { (void)m; return (DWORD)dc_exe_path(b, (int)n); }
BOOL WINAPI AllocConsole(void) { return TRUE; }
BOOL WINAPI FreeConsole(void) { return TRUE; }

/* ------------------------------------------------------------------ user32 */
int WINAPI MessageBoxA(HWND w, LPCSTR text, LPCSTR cap, UINT type) {
  (void)w;
  flush_all();
  if (!text) text = "";
  if (!cap) cap = "Error";
  return dc_messagebox(text, (int)strlen(text), cap, (int)strlen(cap), (int)type);
}
SHORT WINAPI GetAsyncKeyState(int vk) { return (SHORT)dc_keystate(vk); }
SHORT WINAPI GetKeyState(int vk) { return (SHORT)dc_keystate(vk); }
BOOL WINAPI GetCursorPos(LPPOINT p) { p->x = 0; p->y = 0; return TRUE; }
BOOL WINAPI ShowWindow(HWND w, int n) { (void)w; (void)n; return TRUE; }

/* ------------------------------------------------------------------ msvcrt behaviour */
IMPORT(abort) void dc_abort(int code);

void abort(void) {
  fflush(stdout);
  fputs("\nThis application has requested the Runtime to terminate it in an unusual way.\n"
        "Please contact the application's support team for more information.\n", stderr);
  fflush(stderr);
  dc_abort(3);
  __builtin_unreachable();
}

void __assert_fail(const char *expr, const char *file, int line, const char *func) {
  (void)func;
  fflush(stdout);
  fprintf(stderr, "Assertion failed!\n\nProgram: ");
  char path[300];
  int n = dc_exe_path(path, sizeof(path));
  path[n < (int)sizeof(path) ? n : (int)sizeof(path) - 1] = 0;
  fprintf(stderr, "%s\nFile: %s, Line %d\n\nExpression: %s\n", path, file, line, expr);
  abort();
}

/* ------------------------------------------------------------------ msvcrt extras */
static unsigned long holdrand = 1;
void srand(unsigned seed) { holdrand = seed; }
int rand(void) { return (int)(((holdrand = holdrand * 214013L + 2531011L) >> 16) & 0x7fff); }

char *gets(char *s) {
  int c, n = 0;
  fflush(stdout);
  while ((c = getchar()) != EOF && c != '\n') s[n++] = (char)c;
  if (c == EOF && n == 0) return NULL;
  s[n] = 0;
  return s;
}

static char *u64toa(unsigned long long v, char *buf, int radix, int neg) {
  char tmp[72];
  int i = 0;
  if (radix < 2 || radix > 36) radix = 10;
  do {
    int d = (int)(v % (unsigned)radix);
    tmp[i++] = (char)(d < 10 ? '0' + d : 'a' + d - 10);
    v /= (unsigned)radix;
  } while (v);
  char *p = buf;
  if (neg) *p++ = '-';
  while (i) *p++ = tmp[--i];
  *p = 0;
  return buf;
}
char *_i64toa(long long v, char *b, int r) { return (r == 10 && v < 0) ? u64toa(0ULL - (unsigned long long)v, b, r, 1) : u64toa((unsigned long long)v, b, r, 0); }
char *_ui64toa(unsigned long long v, char *b, int r) { return u64toa(v, b, r, 0); }
char *itoa(int v, char *b, int r) { return (r == 10 && v < 0) ? u64toa(0ULL - (unsigned long long)(long long)v, b, r, 1) : u64toa((unsigned)v, b, r, 0); }
char *_itoa(int v, char *b, int r) { return itoa(v, b, r); }
char *ltoa(long v, char *b, int r) { return itoa((int)v, b, r); }
char *_ltoa(long v, char *b, int r) { return itoa((int)v, b, r); }
char *ultoa(unsigned long v, char *b, int r) { return u64toa(v, b, r, 0); }
char *strrev(char *s) {
  size_t n = strlen(s);
  for (size_t i = 0; i < n / 2; i++) {
    char t = s[i];
    s[i] = s[n - 1 - i];
    s[n - 1 - i] = t;
  }
  return s;
}
char *_strrev(char *s) { return strrev(s); }
char *strupr(char *s) { for (char *p = s; *p; p++) if (*p >= 'a' && *p <= 'z') *p -= 32; return s; }
char *_strupr(char *s) { return strupr(s); }
char *strlwr(char *s) { for (char *p = s; *p; p++) if (*p >= 'A' && *p <= 'Z') *p += 32; return s; }
char *_strlwr(char *s) { return strlwr(s); }
static int lower(int c) { return c >= 'A' && c <= 'Z' ? c + 32 : c; }
int strnicmp(const char *a, const char *b, size_t n) {
  for (size_t i = 0; i < n; i++) {
    int x = lower((unsigned char)a[i]), y = lower((unsigned char)b[i]);
    if (x != y || !x) return x - y;
  }
  return 0;
}
int _strnicmp(const char *a, const char *b, size_t n) { return strnicmp(a, b, n); }
int stricmp(const char *a, const char *b) { return strnicmp(a, b, (size_t)-1); }
int _stricmp(const char *a, const char *b) { return stricmp(a, b); }
int strcmpi(const char *a, const char *b) { return stricmp(a, b); }
