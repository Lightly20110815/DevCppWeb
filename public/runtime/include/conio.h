/* conio.h for the web version of Dev-C++ (subset of MinGW's) */
#ifndef _CONIO_H_
#define _CONIO_H_

#ifdef __cplusplus
extern "C" {
#endif

int _getch(void);
int _getche(void);
int _kbhit(void);
int _putch(int);
int _ungetch(int);
int _cputs(const char *);
char *_cgets(char *);
int _cprintf(const char *, ...);

int getch(void);
int getche(void);
int kbhit(void);
int putch(int);
int ungetch(int);
int cputs(const char *);
char *cgets(char *);
int cprintf(const char *, ...);

#ifdef __cplusplus
}
#endif

#endif
