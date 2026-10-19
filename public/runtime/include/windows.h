/* windows.h for the web version of Dev-C++.
   Implements the console / timing subset of the Win32 API that student programs use. */
#ifndef _WINDOWS_H
#define _WINDOWS_H

#include <stddef.h>
#include <stdint.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

#define WINAPI
#define APIENTRY
#define CALLBACK
#define WINAPIV
#define VOID void
#define CONST const

#ifndef TRUE
#define TRUE 1
#endif
#ifndef FALSE
#define FALSE 0
#endif

typedef int BOOL;
typedef unsigned char BYTE;
typedef unsigned short WORD;
typedef unsigned long DWORD;
typedef short SHORT;
typedef unsigned short USHORT;
typedef long LONG;
typedef unsigned long ULONG;
typedef int INT;
typedef unsigned int UINT;
typedef long long LONGLONG;
typedef unsigned long long ULONGLONG;
typedef unsigned long long DWORD64;
typedef float FLOAT;
typedef char CHAR;
typedef unsigned char UCHAR;
typedef wchar_t WCHAR;
typedef char TCHAR;
typedef void *PVOID;
typedef void *LPVOID;
typedef const void *LPCVOID;
typedef char *LPSTR;
typedef const char *LPCSTR;
typedef wchar_t *LPWSTR;
typedef const wchar_t *LPCWSTR;
typedef char *LPTSTR;
typedef const char *LPCTSTR;
typedef DWORD *LPDWORD;
typedef BOOL *LPBOOL;
typedef void *HANDLE;
typedef HANDLE HWND;
typedef HANDLE HINSTANCE;
typedef HANDLE HMODULE;
typedef HANDLE HDC;
typedef HANDLE HICON;
typedef HANDLE HMENU;
typedef intptr_t INT_PTR;
typedef uintptr_t UINT_PTR;
typedef intptr_t LONG_PTR;
typedef uintptr_t ULONG_PTR;
typedef uintptr_t WPARAM;
typedef intptr_t LPARAM;
typedef intptr_t LRESULT;
typedef ULONG_PTR SIZE_T;

typedef union _LARGE_INTEGER {
  struct {
    DWORD LowPart;
    LONG HighPart;
  };
  struct {
    DWORD LowPart;
    LONG HighPart;
  } u;
  LONGLONG QuadPart;
} LARGE_INTEGER, *PLARGE_INTEGER;

typedef struct _COORD {
  SHORT X;
  SHORT Y;
} COORD, *PCOORD;

typedef struct _SMALL_RECT {
  SHORT Left;
  SHORT Top;
  SHORT Right;
  SHORT Bottom;
} SMALL_RECT, *PSMALL_RECT;

typedef struct _CONSOLE_SCREEN_BUFFER_INFO {
  COORD dwSize;
  COORD dwCursorPosition;
  WORD wAttributes;
  SMALL_RECT srWindow;
  COORD dwMaximumWindowSize;
} CONSOLE_SCREEN_BUFFER_INFO, *PCONSOLE_SCREEN_BUFFER_INFO;

typedef struct _CONSOLE_CURSOR_INFO {
  DWORD dwSize;
  BOOL bVisible;
} CONSOLE_CURSOR_INFO, *PCONSOLE_CURSOR_INFO;

typedef struct _SYSTEMTIME {
  WORD wYear;
  WORD wMonth;
  WORD wDayOfWeek;
  WORD wDay;
  WORD wHour;
  WORD wMinute;
  WORD wSecond;
  WORD wMilliseconds;
} SYSTEMTIME, *PSYSTEMTIME, *LPSYSTEMTIME;

typedef struct tagPOINT {
  LONG x;
  LONG y;
} POINT, *PPOINT, *LPPOINT;

#define STD_INPUT_HANDLE ((DWORD)-10)
#define STD_OUTPUT_HANDLE ((DWORD)-11)
#define STD_ERROR_HANDLE ((DWORD)-12)
#define INVALID_HANDLE_VALUE ((HANDLE)(intptr_t)-1)

#define FOREGROUND_BLUE 0x0001
#define FOREGROUND_GREEN 0x0002
#define FOREGROUND_RED 0x0004
#define FOREGROUND_INTENSITY 0x0008
#define BACKGROUND_BLUE 0x0010
#define BACKGROUND_GREEN 0x0020
#define BACKGROUND_RED 0x0040
#define BACKGROUND_INTENSITY 0x0080

#define MB_OK 0x00000000L
#define MB_OKCANCEL 0x00000001L
#define MB_ABORTRETRYIGNORE 0x00000002L
#define MB_YESNOCANCEL 0x00000003L
#define MB_YESNO 0x00000004L
#define MB_RETRYCANCEL 0x00000005L
#define MB_ICONHAND 0x00000010L
#define MB_ICONERROR MB_ICONHAND
#define MB_ICONSTOP MB_ICONHAND
#define MB_ICONQUESTION 0x00000020L
#define MB_ICONEXCLAMATION 0x00000030L
#define MB_ICONWARNING MB_ICONEXCLAMATION
#define MB_ICONASTERISK 0x00000040L
#define MB_ICONINFORMATION MB_ICONASTERISK
#define MB_DEFBUTTON1 0x00000000L
#define MB_DEFBUTTON2 0x00000100L
#define MB_APPLMODAL 0x00000000L
#define MB_SYSTEMMODAL 0x00001000L
#define MB_TOPMOST 0x00040000L
#define IDOK 1
#define IDCANCEL 2
#define IDABORT 3
#define IDRETRY 4
#define IDIGNORE 5
#define IDYES 6
#define IDNO 7

#define VK_LBUTTON 0x01
#define VK_RBUTTON 0x02
#define VK_CANCEL 0x03
#define VK_MBUTTON 0x04
#define VK_BACK 0x08
#define VK_TAB 0x09
#define VK_CLEAR 0x0C
#define VK_RETURN 0x0D
#define VK_SHIFT 0x10
#define VK_CONTROL 0x11
#define VK_MENU 0x12
#define VK_PAUSE 0x13
#define VK_CAPITAL 0x14
#define VK_ESCAPE 0x1B
#define VK_SPACE 0x20
#define VK_PRIOR 0x21
#define VK_NEXT 0x22
#define VK_END 0x23
#define VK_HOME 0x24
#define VK_LEFT 0x25
#define VK_UP 0x26
#define VK_RIGHT 0x27
#define VK_DOWN 0x28
#define VK_SELECT 0x29
#define VK_PRINT 0x2A
#define VK_EXECUTE 0x2B
#define VK_SNAPSHOT 0x2C
#define VK_INSERT 0x2D
#define VK_DELETE 0x2E
#define VK_HELP 0x2F
#define VK_LWIN 0x5B
#define VK_RWIN 0x5C
#define VK_NUMPAD0 0x60
#define VK_NUMPAD1 0x61
#define VK_NUMPAD2 0x62
#define VK_NUMPAD3 0x63
#define VK_NUMPAD4 0x64
#define VK_NUMPAD5 0x65
#define VK_NUMPAD6 0x66
#define VK_NUMPAD7 0x67
#define VK_NUMPAD8 0x68
#define VK_NUMPAD9 0x69
#define VK_MULTIPLY 0x6A
#define VK_ADD 0x6B
#define VK_SEPARATOR 0x6C
#define VK_SUBTRACT 0x6D
#define VK_DECIMAL 0x6E
#define VK_DIVIDE 0x6F
#define VK_F1 0x70
#define VK_F2 0x71
#define VK_F3 0x72
#define VK_F4 0x73
#define VK_F5 0x74
#define VK_F6 0x75
#define VK_F7 0x76
#define VK_F8 0x77
#define VK_F9 0x78
#define VK_F10 0x79
#define VK_F11 0x7A
#define VK_F12 0x7B
#define VK_NUMLOCK 0x90
#define VK_SCROLL 0x91
#define VK_LSHIFT 0xA0
#define VK_RSHIFT 0xA1
#define VK_LCONTROL 0xA2
#define VK_RCONTROL 0xA3
#define VK_LMENU 0xA4
#define VK_RMENU 0xA5

#define INFINITE 0xFFFFFFFF
#define MAX_PATH 260

/* kernel32 */
void WINAPI Sleep(DWORD dwMilliseconds);
DWORD WINAPI GetTickCount(void);
ULONGLONG WINAPI GetTickCount64(void);
BOOL WINAPI QueryPerformanceCounter(LARGE_INTEGER *lpPerformanceCount);
BOOL WINAPI QueryPerformanceFrequency(LARGE_INTEGER *lpFrequency);
void WINAPI GetLocalTime(LPSYSTEMTIME lpSystemTime);
void WINAPI GetSystemTime(LPSYSTEMTIME lpSystemTime);
void WINAPI ExitProcess(UINT uExitCode);
DWORD WINAPI GetCurrentProcessId(void);
DWORD WINAPI GetLastError(void);
BOOL WINAPI Beep(DWORD dwFreq, DWORD dwDuration);
HANDLE WINAPI GetStdHandle(DWORD nStdHandle);
BOOL WINAPI CloseHandle(HANDLE hObject);
BOOL WINAPI SetConsoleTextAttribute(HANDLE hConsoleOutput, WORD wAttributes);
BOOL WINAPI SetConsoleCursorPosition(HANDLE hConsoleOutput, COORD dwCursorPosition);
BOOL WINAPI GetConsoleScreenBufferInfo(HANDLE hConsoleOutput, PCONSOLE_SCREEN_BUFFER_INFO lpInfo);
BOOL WINAPI SetConsoleCursorInfo(HANDLE hConsoleOutput, const CONSOLE_CURSOR_INFO *lpInfo);
BOOL WINAPI GetConsoleCursorInfo(HANDLE hConsoleOutput, PCONSOLE_CURSOR_INFO lpInfo);
BOOL WINAPI SetConsoleTitleA(LPCSTR lpConsoleTitle);
DWORD WINAPI GetConsoleTitleA(LPSTR lpConsoleTitle, DWORD nSize);
BOOL WINAPI FillConsoleOutputCharacterA(HANDLE h, CHAR c, DWORD n, COORD at, LPDWORD written);
BOOL WINAPI FillConsoleOutputAttribute(HANDLE h, WORD attr, DWORD n, COORD at, LPDWORD written);
BOOL WINAPI WriteConsoleA(HANDLE h, const void *buf, DWORD n, LPDWORD written, LPVOID reserved);
BOOL WINAPI SetConsoleOutputCP(UINT cp);
BOOL WINAPI SetConsoleCP(UINT cp);
UINT WINAPI GetConsoleOutputCP(void);
HWND WINAPI GetConsoleWindow(void);
DWORD WINAPI GetModuleFileNameA(HMODULE hModule, LPSTR lpFilename, DWORD nSize);
BOOL WINAPI AllocConsole(void);
BOOL WINAPI FreeConsole(void);

/* user32 */
int WINAPI MessageBoxA(HWND hWnd, LPCSTR lpText, LPCSTR lpCaption, UINT uType);
SHORT WINAPI GetAsyncKeyState(int vKey);
SHORT WINAPI GetKeyState(int nVirtKey);
BOOL WINAPI GetCursorPos(LPPOINT lpPoint);
BOOL WINAPI ShowWindow(HWND hWnd, int nCmdShow);

#define SetConsoleTitle SetConsoleTitleA
#define GetConsoleTitle GetConsoleTitleA
#define FillConsoleOutputCharacter FillConsoleOutputCharacterA
#define WriteConsole WriteConsoleA
#define MessageBox MessageBoxA
#define GetModuleFileName GetModuleFileNameA
#define SW_HIDE 0
#define SW_SHOW 5
#define SW_MAXIMIZE 3
#define SW_MINIMIZE 6

#define ZeroMemory(d, l) memset((d), 0, (l))
#define CopyMemory(d, s, l) memcpy((d), (s), (l))
#define FillMemory(d, l, f) memset((d), (f), (l))
#define LOWORD(l) ((WORD)(((uintptr_t)(l)) & 0xffff))
#define HIWORD(l) ((WORD)((((uintptr_t)(l)) >> 16) & 0xffff))
#define LOBYTE(w) ((BYTE)(((uintptr_t)(w)) & 0xff))
#define HIBYTE(w) ((BYTE)((((uintptr_t)(w)) >> 8) & 0xff))
#define MAKEWORD(a, b) ((WORD)(((BYTE)(a)) | ((WORD)((BYTE)(b))) << 8))
#define MAKELONG(a, b) ((LONG)(((WORD)(a)) | ((DWORD)((WORD)(b))) << 16))
#define RGB(r, g, b) ((DWORD)(((BYTE)(r) | ((WORD)((BYTE)(g)) << 8)) | (((DWORD)(BYTE)(b)) << 16)))

#ifdef __cplusplus
}
#endif

#endif /* _WINDOWS_H */
