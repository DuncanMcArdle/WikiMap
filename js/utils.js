// Add commas to a number
function FormatNumber(number) {
  while (/(\d+)(\d{3})/.test(number.toString())) {
    number = number.toString().replace(/(\d+)(\d{3})/, "$1" + "," + "$2");
  }
  return number;
}

// Add a zero to single digit numbers
function AddZero(Number) {
  // Check if the number is a single digit number or string
  if (
    (!isNaN(Number) && Number < 10) ||
    (isNaN(Number) && Number.length <= 1)
  ) {
    // Add a 0 to the start
    Number = "0" + Number;
  }

  // Return the newly formatted number
  return Number;
}

// Optionally add a plural suffix
function PluralSuffix(word, value) {
  // Return the suffix "s" if the value supplies is plural
  return value != 1 ? word + "s" : word;
}

// Get the difference between two timestamps
function GetTimeSinceTimestamp(timestamp1, timestamp2, suffix = "") {
  // Check if a suffix was supplied
  if (suffix) {
    // If so, prepend a space to it
    suffix = " " + suffix;
  }

  // Calculate the difference in seconds
  let difference = timestamp2 - timestamp1;

  // If the difference is 0
  if (difference <= 0) {
    return "Just now";
  }
  // If the difference is less than a minute
  else if (difference < 60) {
    return difference + " " + PluralSuffix("second", difference) + suffix;
  }
  // If the difference is less than an hour
  else if (difference < 3600) {
    difference = Math.round(difference / 60);
    return difference + " " + PluralSuffix("minute", difference) + suffix;
  }
  // If the difference is less than a day
  else if (difference < 86400) {
    difference = Math.round(difference / 3600);
    return difference + " " + PluralSuffix("hour", difference) + suffix;
  }
  // If the difference is less than a month
  else if (difference < 2678400) {
    difference = Math.round(difference / 86400);
    return difference + " " + PluralSuffix("day", difference) + suffix;
  }
  // If the difference is less than a year
  else if (difference < 32140800) {
    difference = Math.round(difference / 2678400);
    return difference + " " + PluralSuffix("month", difference) + suffix;
  }
  // Return the difference in years
  else {
    difference = Math.round(difference / 32140800);
    return difference + " " + PluralSuffix("year", difference) + suffix;
  }
}
