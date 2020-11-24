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
			"<b><span class='redText'>Disconnected</span> (<a href='#' id='additionalInfoReconnect'>reconnect</a>)</b>"
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
		totalEdits++;
		totalLettersChanged += Math.abs(editObject['change_size']);
		const editsPerSecond = (totalEdits / totalConnectedTime).toFixed(2);
		const lettersPerEdit = (totalLettersChanged / totalEdits).toFixed(2);

		$('#additionalInfoTotalEdits').text(
			FormatNumber(totalEdits) + ' (' + editsPerSecond + ' per second)'
		);
		$('#additionalInfoTotalCharactersChanged').text(
			FormatNumber(totalLettersChanged) +
				' (' +
				lettersPerEdit +
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

			// Construct the region text (if a region was specified)
			const regionText =
				editObject['geo_ip']['region_name'] != null
					? "<span class='region " +
					  (showRegions ? '' : 'hidden') +
					  "'> (" +
					  editObject['geo_ip']['region_name'] +
					  ')</span>'
					: '';

			// Construct a flag element for the respective country
			const flag =
				'<span class="flag-icon flag-icon-' +
				GetCountryCode(editObject['geo_ip']['country_name']) +
				'"></span>';

			// Construct a Wiki link for the edited page
			const wikiLink =
				'<a href="https://en.wikipedia.org/wiki/' +
				encodeURI(editObject['page_title']) +
				'" target="_blank" title="' +
				editObject['page_title'] +
				'">' +
				editObject['page_title'] +
				'</a>';

			// Prepend the edit to the "live edits" table
			$('#liveEditTable').prepend(
				'<tr><td>' +
					flag +
					'</td><td>' +
					editObject['geo_ip']['country_name'] +
					regionText +
					'</span></td><td>' +
					wikiLink +
					'</td></tr>'
			);

			// Remove any entries beyond 10
			$('#liveEditTable tr:nth-child(n+11)').remove();

			// Variable to keep track of whether the specific country has been found
			let countryExists = false;

			// Loop through the existing country list
			for (let country of countries) {
				// Check if the country in question matches the new one
				if (country['name'] == editObject['geo_ip']['country_name']) {
					// Increment that country's number of edits
					country['edits']++;
					country['lastEdit'] = editObject['Timestamp'];
					countryExists = true;
					break;
				}
			}

			// If no match was found (indicating that this is the first occurence of this country)
			if (!countryExists) {
				// Assemble a country object
				const countryObject = {
					name: editObject['geo_ip']['country_name'],
					edits: 1,
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
	// Sort the list of countries by their number of edits (and then their names)
	countries.sort(function (a, b) {
		return a['edits'] != b['edits']
			? b['edits'] - a['edits']
			: b['name'] < a['name']
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
				GetCountryCode(countries[i]['name']) +
				"'></span></td><td>" +
				countries[i]['name'] +
				'</td><td>' +
				GetTimeSinceTimestamp(
					Math.round(countries[i]['lastEdit'] / 1000),
					Math.round(new Date().getTime() / 1000),
					'ago'
				) +
				'</td><td>' +
				FormatNumber(countries[i]['edits']) +
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
	$(document).on('click', '#additionalInfoReconnect', function (event) {
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
		webSocketConnectionPaused = 1 - webSocketConnectionPaused;
		$('#additionalInfoPauseResumeEditsButton')
			.toggleClass('btn-warning btn-success')
			.html(
				webSocketConnectionPaused
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
