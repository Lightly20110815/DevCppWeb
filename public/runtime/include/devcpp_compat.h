/* Force-included into every translation unit compiled by the web version of Dev-C++.
   Declares the few C library functions that WASI's libc leaves out but MinGW programs use. */
#ifndef __DEVCPP_COMPAT_H
#define __DEVCPP_COMPAT_H

#include <stdlib.h>

/* msvcrt's rand() */
#undef RAND_MAX
#define RAND_MAX 0x7fff

#ifndef __int64
#define __int64 long long
#endif

#ifdef __cplusplus
extern "C" {
#endif
int system(const char *__command);
char *gets(char *__s);
char *itoa(int __value, char *__buf, int __radix);
char *_itoa(int __value, char *__buf, int __radix);
char *ltoa(long __value, char *__buf, int __radix);
char *_ltoa(long __value, char *__buf, int __radix);
char *ultoa(unsigned long __value, char *__buf, int __radix);
char *_i64toa(long long __value, char *__buf, int __radix);
char *_ui64toa(unsigned long long __value, char *__buf, int __radix);
char *strrev(char *__s);
char *_strrev(char *__s);
char *strupr(char *__s);
char *_strupr(char *__s);
char *strlwr(char *__s);
char *_strlwr(char *__s);
int stricmp(const char *__a, const char *__b);
int _stricmp(const char *__a, const char *__b);
int strcmpi(const char *__a, const char *__b);
int strnicmp(const char *__a, const char *__b, size_t __n);
int _strnicmp(const char *__a, const char *__b, size_t __n);
int _getch(void);
int _kbhit(void);
#ifdef __cplusplus
}
#endif

#endif
