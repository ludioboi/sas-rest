/*
 * Copyright (c) 2024.
 * @author: Frederic Wild
*/


class Colors {
    // Special color codes
    static RESET = "\x1b[0m"
    static BRIGHT = "\x1b[1m"
    static DIM = "\x1b[2m"
    static UNDERSCORE = "\x1b[4m"
    static BLINK = "\x1b[5m"
    static REVERSE = "\x1b[7m"
    static HIDDEN = "\x1b[8m"

    // Foreground colors
    static FOREGROUND_BLACK = "\x1b[30m"
    static FOREGROUND_RED = "\x1b[31m"
    static FOREGROUND_GREEN = "\x1b[32m"
    static FOREGROUND_YELLOW = "\x1b[33m"
    static FOREGROUND_BLUE = "\x1b[34m"
    static FOREGROUND_MAGENTA = "\x1b[35m"
    static FOREGROUND_CYAN = "\x1b[36m"
    static FOREGROUND_WHITE = "\x1b[37m"

    // Background colors
    static BACKGROUND_BLACK = "\x1b[40m"
    static BACKGROUND_RED = "\x1b[41m"
    static BACKGROUND_GREEN = "\x1b[42m"
    static BACKGROUND_YELLOW = "\x1b[43m"
    static BACKGROUND_BLUE = "\x1b[44m"
    static BACKGROUND_MAGENTA = "\x1b[45m"
    static BACKGROUND_CYAN = "\x1b[46m"
    static BACKGROUND_WHITE = "\x1b[47m"
}

const formatTimestamp = (date) => {
  const options = {
    dateStyle: 'medium',
    timeStyle: 'medium',
  };
  const formatter = new Intl.DateTimeFormat('de-DE', options);
  return formatter.format(date);
};

function log(x, timestamp=true){
    let time = ""
    if (timestamp) {
        time = Colors.RESET + "[" + formatTimestamp(Date.now()) + "] "
    }
    console.log(time + x)
}
function LOG_INFO(x, timestamp=true) {
    log(Colors.BACKGROUND_GREEN + Colors.FOREGROUND_WHITE + "INFO" + Colors.RESET + " -> " + x)
}

function LOG_ERROR(x, timestamp=true) {
    log(Colors.BACKGROUND_RED + Colors.FOREGROUND_WHITE + "ERR" + Colors.RESET + " -> " + x)
}

function LOG_WARNING(x, timestamp=true) {
    log(Colors.BACKGROUND_YELLOW + Colors.FOREGROUND_WHITE + "WARN" + Colors.RESET + " -> " + x)
}

module.exports = {
    "info": LOG_INFO,
    "error": LOG_ERROR,
    "warning": LOG_WARNING,
    "Colors": Colors
}