#include "mapping/config/RuntimeConfig.hpp"
#include <toml++/toml.hpp>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <sstream>
#include <stdexcept>
#include <string>

namespace {
std::string readFile(const char *filename) {
  std::ifstream input(std::filesystem::path(filename), std::ios::binary);
  if (!input)
    throw std::runtime_error(std::string("Cannot read: ") + filename);
  return {std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
}

// An excerpt replaces fields in its explicitly named context. This only merges
// TOML syntax; all configuration acceptance is decided by the real parser.
void merge(toml::table &destination, const toml::table &excerpt) {
  for (const auto &[key, value] : excerpt) {
    if (auto *existing = destination[key].as_table(); existing && value.is_table())
      merge(*existing, *value.as_table());
    else
      destination.insert_or_assign(key, value);
  }
}

void require(bool condition, const char *message) {
  if (!condition)
    throw std::runtime_error(message);
}
} // namespace

int main(int argc, char **argv) {
  try {
    if (argc < 2 || argc > 4) {
      std::cerr << "Usage: manual_source_check config [context] [--first]\n";
      return 2;
    }
    auto text = readFile(argv[1]);
    bool first = false;
    for (int i = 2; i < argc; ++i) {
      if (std::string(argv[i]) == "--first") {
        first = true;
      } else {
        auto context = toml::parse(readFile(argv[i]));
        merge(context, toml::parse(text));
        std::ostringstream merged;
        merged << toml::toml_formatter(context);
        text = merged.str();
      }
    }

    const auto parsed = mapping::parseRuntimeConfig(text);
    if (!parsed) {
      std::cerr << parsed.error().path << ": " << parsed.error().detail << '\n';
      return 1;
    }
    const auto &config = parsed.value();
    std::size_t resolutions = 0;
    for (const auto &route : config.routes) {
      for (std::uint64_t seed = 0; seed < 64; ++seed) {
        const auto result = mapping::rollRuntimeMap(config, route, seed);
        if (!result)
          throw std::runtime_error(result.error().path + ": " + result.error().detail);
        ++resolutions;
        if (first) {
          require(config.routes.size() == 1, "First file must have exactly one route");
          require(route.id == "scroll_map", "First route differs from the tutorial");
          require(route.inputCodes.size() == 1 &&
                      mapping::unpackRuntimeItemCode(route.inputCodes[0]) == "tsc",
                  "First route must require exactly tsc");
          const auto &map = result.value();
          require(map.tierId == "tier1" && map.groupId == "field" &&
                      map.entryLevelId == 2 && map.densityPercent == 100 &&
                      map.stats.empty() && map.traits.empty(),
                  "First map result differs from the documented result");
          require(mapping::buildRuntimeHudText(config, map) ==
                      "tier1\nMonster Density: 100%",
                  "First HUD differs from the actual display builder");
        }
      }
    }
    std::cout << "parseRuntimeConfig accepted; " << config.routes.size()
              << " route(s); " << resolutions
              << " resolutions through source rollRuntimeMap\n";
    if (first)
      std::cout << "buildRuntimeHudText: tier1 | Monster Density: 100%\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
