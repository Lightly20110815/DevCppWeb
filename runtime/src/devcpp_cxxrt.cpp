// C++ runtime support: print uncaught exceptions the way MinGW's libstdc++ does.
#include <cstdio>
#include <cstdlib>
#include <exception>
#include <typeinfo>
#include <cxxabi.h>

extern "C" __attribute__((import_module("devcpp"), import_name("abort"))) void dc_abort(int code);

namespace {

void devcpp_terminate() {
  std::fflush(stdout);
  std::type_info *t = abi::__cxa_current_exception_type();
  if (t) {
    int status = 0;
    char *dem = abi::__cxa_demangle(t->name(), nullptr, nullptr, &status);
    std::fprintf(stderr, "terminate called after throwing an instance of '%s'\n", status == 0 && dem ? dem : t->name());
    std::free(dem);
    try {
      throw;
    } catch (const std::exception &e) {
      std::fprintf(stderr, "  what():  %s\n", e.what());
    } catch (...) {
    }
  } else {
    std::fprintf(stderr, "terminate called without an active exception\n");
  }
  std::fprintf(stderr, "\nThis application has requested the Runtime to terminate it in an unusual way.\n"
                       "Please contact the application's support team for more information.\n");
  std::fflush(stderr);
  dc_abort(3);
  std::_Exit(3);
}

struct Installer {
  Installer() { std::set_terminate(devcpp_terminate); }
} installer;

} // namespace
