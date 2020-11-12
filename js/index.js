// Miscellaneous variables
var countries = [];
var firstMessageReceived = false;
var editsReceivedWhilePaused = [];
var showRegions = false;

// Websocket variables
var webSocketConnection;
var webSocketConnectionPaused = false;
var webSocketPausedTime = 0;

// Google Map variables
var googleMap;
var googleMapMarkerClusterer;
var googleMapInfoWindow;

// Additional info counters
var totalConnectedTime = 0;
var totalEdits = 0;
var totalEditsWithLocation = 0;
var totalLettersChanged = 0;

function InitialiseGoogleMap() {
	// Initialise the Google Map
	googleMap = new google.maps.Map(document.getElementById('map'), {
		zoom: 3,
		center: { lat: 40, lng: -30 },
	});

	// Initialise the marker clusterer
	googleMapMarkerClusterer = new MarkerClusterer(googleMap, [], {
		imagePath:
			'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m',
	});
}

function InitialiseWebSocketConnection() {
	// Initialise a websocket connection
	webSocketConnection = new WebSocket('ws://alpha.hatnote.com:9000');

	// Upon the websocket connection (re-)connecting
	webSocketConnection.onopen = function () {
		// Update the relevant sections in the "additional information" box
		$('#additionalInfoConnectionStatus').html(
			"<b><span class='greenText'>Connected</span></b>"
		);
		$('#additionalInfoConnectedTime').text(
			GetTimeSinceTimestamp(0, totalConnectedTime, false)
		);
	};

	// Upon a websocket message being received
	webSocketConnection.onmessage = function (message) {
		// Parse the incoming message
		const parsedMessage = JSON.parse(message.data);

		// Check if the message is an edit
		if (parsedMessage['action'] == 'edit') {
			// Store the timestamp of the edit
			parsedMessage['Timestamp'] = new Date().getTime();

			ProcessEdit(parsedMessage);
		}
	};

	// When the websocket connection disconnects
	webSocketConnection.onclose = function (msg) {
		// Update the relevant sections in the "additional information" box
		$('#additionalInfoConnectionStatus').html(
			"<b><span class='redText'>Disconnected</span> (<a href='#' id='additionalInfoConnectionReconnect'>reconnect</a>)</b>"
		);
	};
}

// Function that takes care of processing incoming edits
function ProcessEdit(editObject) {
	// Check if edits are paused
	if (webSocketConnectionPaused) {
		// If so, add the edits to the paused edits array
		editsReceivedWhilePaused.push(editObject);
	} else {
		// Increment the total number of edits received and the total number of letters changed
		$('#additionalInfoTotalEdits').text(
			FormatNumber(++totalEdits) +
				' (' +
				+(totalEdits / totalConnectedTime).toFixed(2) +
				' per second)'
		);
		$('#additionalInfoTotalCharactersChanged').text(
			FormatNumber(
				(totalLettersChanged += Math.abs(editObject['change_size']))
			) +
				' (' +
				+(totalLettersChanged / totalEdits).toFixed(2) +
				' per edit)'
		);

		// Check if the message includes enough data to log it in the tables
		if (
			editObject['geo_ip'] &&
			editObject['geo_ip']['country_name'] &&
			editObject['page_title']
		) {
			// Increment the total number of edits received that contain location data
			totalEditsWithLocation++;

			// Check if any pre-first-message cleanup is required
			if (!firstMessageReceived) {
				// If so, perform the cleanup
				$('.emptyPlaceholder').remove();

				// Change the "first message received" value
				firstMessageReceived = true;
			}

			// Obtain the location (using the country if a region is not specified)
			const targetLocation =
				editObject['geo_ip']['region_name'] != null
					? editObject['geo_ip']['region_name']
					: editObject['geo_ip']['country_name'];
			const regionText =
				editObject['geo_ip']['region_name'] != null
					? "<span class='region " +
					  (showRegions ? '' : 'hidden') +
					  "'> (" +
					  editObject['geo_ip']['region_name'] +
					  ')</span>'
					: '';

			// Prepend the edit to the "live edits" table (and remove any entries beyond 10)
			$('#liveEditTable').prepend(
				'<tr><td><span class="flag-icon flag-icon-' +
					GetCountryCode(
						editObject['geo_ip']['country_name']
					).toLowerCase() +
					'"></span></td><td>' +
					editObject['geo_ip']['country_name'] +
					regionText +
					'</span></td><td><a href="https://en.wikipedia.org/wiki/' +
					encodeURI(editObject['page_title']) +
					'" target="_blank" title="' +
					editObject['page_title'] +
					'">' +
					editObject['page_title'] +
					'</a></td></tr>'
			);
			$('#liveEditTable tr:nth-child(n+11)').remove();

			// Variable to keep track of whether the specific country has been found
			let countryAdded = false;

			// Loop through the existing country list
			for (let i = 0; i < countries.length; i++) {
				// Check if the country in question matches the new one
				if (
					countries[i]['country'] ==
					editObject['geo_ip']['country_name']
				) {
					// Increment that country's counter
					countries[i]['counter']++;
					countries[i]['lastEdit'] = editObject['Timestamp'];
					countryAdded = true;
					break;
				}
			}

			// If no match was found (indicating that this is the first occurence of this country)
			if (!countryAdded) {
				// Assemble a country object
				const countryObject = {
					country: editObject['geo_ip']['country_name'],
					counter: 1,
					lastEdit: editObject['Timestamp'],
				};

				// Add the country to the list
				countries.push(countryObject);
			}

			// Update the "most active countries" table
			UpdateMostActiveCountries();

			// Create a marker for the audit
			let newMarker = new google.maps.Marker({
				location: targetLocation,
				position: {
					lat: editObject['geo_ip']['latitude'],
					lng: editObject['geo_ip']['longitude'],
				},
				articleTitle: editObject['page_title'],
				articleURL:
					'https://en.wikipedia.org/wiki/' +
					encodeURI(editObject['page_title']),
				editTimestamp: editObject['Timestamp'],
				editID: editObject['rev_id'],
				editURL: editObject['url'],
			});

			// Add a click listener to each marker
			newMarker.addListener('click', function () {
				// Calculate when the edit occurred
				let editTimestamp = new Date(this.editTimestamp);

				// Format the edit's info window
				let infoWindowContents = '';
				infoWindowContents +=
					'<tr><th>Date:</th><td>' +
					AddZero(editTimestamp.getDate()) +
					'/' +
					AddZero(editTimestamp.getMonth() + 1) +
					'/' +
					editTimestamp.getFullYear() +
					'</td></tr>';
				infoWindowContents +=
					'<tr><th>Time:</th><td>' +
					AddZero(editTimestamp.getHours()) +
					':' +
					AddZero(editTimestamp.getMinutes()) +
					'</td></tr>';
				infoWindowContents +=
					'<tr><th>Location:</th><td>' + this.location + '</td></tr>';
				infoWindowContents +=
					'<tr><th>Article:</th><td><a href=' +
					this.articleURL +
					" target='_blank' title='" +
					this.articleTitle +
					"'>" +
					this.articleTitle +
					'</a></td></tr>';
				infoWindowContents +=
					'<tr><th>Edit ID:</th><td><a href=' +
					this.editURL +
					" target='_blank'>#" +
					this.editID +
					'</a></td></tr>';

				// Check if an existing info window is open
				if (googleMapInfoWindow) {
					// If so, close it
					googleMapInfoWindow.close();
				}

				// Create the info window
				googleMapInfoWindow = new google.maps.InfoWindow({
					content:
						"<table id='infoWindowTable'>" +
						infoWindowContents +
						'</table>',
				});

				// Display it to the user
				googleMapInfoWindow.open(googleMap, this);
			});

			// Add the marker to the marker clusterer
			googleMapMarkerClusterer.addMarkers([newMarker]);
		}

		// Re-calculate the number of edits received that contain location data
		$('#additionalInfoTotalEditsWithLocation').text(
			FormatNumber(totalEditsWithLocation) +
				' (' +
				+((totalEditsWithLocation / totalEdits) * 100).toFixed(2) +
				'% of total edits)'
		);
	}
}

// Add commas to a number
function FormatNumber(number) {
	while (/(\d+)(\d{3})/.test(number.toString())) {
		number = number.toString().replace(/(\d+)(\d{3})/, '$1' + ',' + '$2');
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
		Number = '0' + Number;
	}

	// Return the newly formatted number
	return Number;
}

// Optionally add a plural suffix
function PluralSuffix(word, value) {
	// Return the suffix "s" if the value supplies is plural
	return value != 1 ? word + 's' : word;
}

// Get the difference between two timestamps
function GetTimeSinceTimestamp(timestamp1, timestamp2, suffix = '') {
	// Check if a suffix was supplied
	if (suffix) {
		// If so, prepend a space to it
		suffix = ' ' + suffix;
	}

	// Calculate the difference in seconds
	let difference = timestamp2 - timestamp1;

	// If the difference is 0
	if (difference <= 0) {
		return 'Just now';
	}
	// If the difference is less than a minute
	else if (difference < 60) {
		return difference + ' ' + PluralSuffix('second', difference) + suffix;
	}
	// If the difference is less than an hour
	else if (difference < 3600) {
		difference = Math.round(difference / 60);
		return difference + ' ' + PluralSuffix('minute', difference) + suffix;
	}
	// If the difference is less than a day
	else if (difference < 86400) {
		difference = Math.round(difference / 3600);
		return difference + ' ' + PluralSuffix('hour', difference) + suffix;
	}
	// If the difference is less than a month
	else if (difference < 2678400) {
		difference = Math.round(difference / 86400);
		return difference + ' ' + PluralSuffix('day', difference) + suffix;
	}
	// If the difference is less than a year
	else if (difference < 32140800) {
		difference = Math.round(difference / 2678400);
		return difference + ' ' + PluralSuffix('month', difference) + suffix;
	}
	// Return the difference in years
	else {
		difference = Math.round(difference / 32140800);
		return difference + ' ' + PluralSuffix('year', difference) + suffix;
	}
}

// Function called every second
function EverySecond() {
	// Check if the WebSocket connection is active
	if (webSocketConnection.readyState == webSocketConnection.OPEN) {
		// If so, update the total connected time
		$('#additionalInfoConnectedTime').text(
			GetTimeSinceTimestamp(0, ++totalConnectedTime)
		);

		// Check if updates are paused
		if (webSocketConnectionPaused) {
			// If so, increment the paused time
			$('#additionalInfoPauseResumeEditsButton').html(
				"<span class='glyphicon glyphicon-play'></span> Resume edits (paused for " +
					GetTimeSinceTimestamp(0, ++webSocketPausedTime) +
					')'
			);
		}
	}

	// Check if any countries have been recorded
	if (countries.length) {
		// If so, update the list of most active countries
		UpdateMostActiveCountries();
	}
}

// Function to update the list of most active countries
function UpdateMostActiveCountries() {
	// Sort the list of countries by their number of edits
	countries.sort(function (a, b) {
		return a['counter'] != b['counter']
			? b['counter'] - a['counter']
			: b['country'] < a['country']
			? 1
			: -1;
	});

	// Empty out any existing countries
	$('#countryTable tbody').empty();

	// Loop through the top 10 countries that have edited content
	for (let i = 0; i < countries.length && i < 10; i++) {
		// Append each country to the "most active countries" table
		$('#countryTable').append(
			"<tr><td><span class='flag-icon flag-icon-" +
				GetCountryCode(countries[i]['country']).toLowerCase() +
				"'></span></td><td>" +
				countries[i]['country'] +
				'</td><td>' +
				GetTimeSinceTimestamp(
					Math.round(countries[i]['lastEdit'] / 1000),
					Math.round(new Date().getTime() / 1000),
					'ago'
				) +
				'</td><td>' +
				FormatNumber(countries[i]['counter']) +
				'</td></tr>'
		);
	}
}

// When the page has finished loading
$(document).ready(function () {
	// Initialise a WebSocket connection
	InitialiseWebSocketConnection();

	// When the "show region" link is pressed
	$(document).on('click', '#showRegionToggle', function (event) {
		// Prevent a hash from being appended to the URL
		event.preventDefault();

		// Toggle the "region show" state
		showRegions = 1 - showRegions;
		showRegions
			? $('.region').removeClass('hidden')
			: $('.region').addClass('hidden');
		$('#showRegionToggle').text(
			showRegions ? '(hide region)' : '(show region)'
		);
	});

	// When the "reconnect" link is pressed
	$(document).on('click', '#additionalInfoConnectionReconnect', function (
		event
	) {
		// Prevent a hash from being appended to the URL
		event.preventDefault();

		// Re-initialise the websocket connection
		InitialiseWebSocketConnection();
	});

	// When the "pause / resume edits" button is pressed
	$('#additionalInfoPauseResumeEditsButton').on('click', function (event) {
		// Prevent a hash from being appended to the URL
		event.preventDefault();

		// Toggle the paused state of the websocket
		$('#additionalInfoPauseResumeEditsButton')
			.toggleClass('btn-warning btn-success')
			.html(
				(webSocketConnectionPaused = 1 - webSocketConnectionPaused)
					? "<span class='glyphicon glyphicon-play'></span> Resume edits (paused for 0 seconds)"
					: "<span class='glyphicon glyphicon-pause'></span> Pause edits"
			);

		// Process any outstanding edits
		while (editsReceivedWhilePaused.length) {
			ProcessEdit(editsReceivedWhilePaused.shift());
		}
	});

	// Run a function every second that updates various parts of the page
	setInterval(EverySecond, 1000);
});
