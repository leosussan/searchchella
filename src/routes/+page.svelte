<script>
  import scheduleData from '$lib/schedule.json';
  import { onMount } from 'svelte';
  import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'; // Corrected import

  /** @type {typeof scheduleData} */
  let schedule = scheduleData;
  let days = ['Friday', 'Saturday', 'Sunday'];
  let selectedDay = 'Friday';
  /** @type {number} - Time in minutes from midnight *in festival timezone* */
  let selectedTime = 15 * 60; // Default: 3:00 PM Pacific
  /** @type {string[]} */
  let stages = [];
  /** @type {typeof scheduleData} */
  let filteredPerformances = [];

  const festivalTimeZone = 'America/Los_Angeles'; // Coachella timezone
  let selectedTimezone = ''; // Will be set to user's timezone in onMount
  let availableTimezones = [
    { label: 'Local', value: '' }, // Placeholder, will be replaced
    { label: 'Pacific (Festival Time)', value: 'America/Los_Angeles' },
    { label: 'Mountain', value: 'America/Denver' },
    { label: 'Central', value: 'America/Chicago' },
    { label: 'Eastern', value: 'America/New_York' },
    { label: 'UTC', value: 'UTC' },
  ];

  /**
   * Livestream links. Quasar has day-specific links.
   * @type {Record<string, string | Record<string, string>>}
   */
  const livestreamLinks = {
    'Coachella Stage': 'Y2FzDMuJ5pI',
    'Outdoor Theatre': 'WxwawRL_nY8',
    'Sahara': 'afO7r8TQTSw',
    'Mojave': 'BajnpDN6vG8',
    'Gobi': 'Kg-KswkXoBg',
    'Sonora': 'TdHrgLciYWw',
    'Quasar': { // Day-specific links for Quasar
        'Friday': '1MOJG5VTh-Y',
        'Saturday': 'SreThbvUUI8',
        'Sunday': 'jKWRY1btTOs'
    }
    // Yuma does not have specified livestreams
  };

  // --- Time Conversion Functions ---

  /**
   * Converts HH:MM string (assumed festival time) to minutes from midnight (festival time).
   * Handles times crossing midnight (e.g., 00:10 is treated as 24:10 = 1450 minutes).
   * @param {string | undefined} timeStr - Time string like "23:10" or "00:10"
   * @returns {number} Minutes from midnight in festival time
   */
  function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    // Treat early morning hours (e.g., 12 AM to 5 AM) as part of the previous day's schedule continuation
    if (hours < 5) {
      return (hours + 24) * 60 + minutes;
    }
    return hours * 60 + minutes;
  }

  /**
   * Creates a Date object representing a specific time on a generic date in the festival timezone.
   * @param {number} minutesFromMidnight - Minutes from midnight in festival time.
   * @returns {Date} A Date object (UTC timestamp) representing that festival time.
   */
  function createFestivalDate(minutesFromMidnight) {
    const hours = Math.floor(minutesFromMidnight / 60) % 24; // Use modulo for hours > 23
    const minutes = minutesFromMidnight % 60;
    // Use a fixed date, the specific date doesn't matter, only the time and timezone offset
    // Need to construct the date string carefully for fromZonedTime
    // Format: 'YYYY-MM-DDTHH:mm:ss' - Use a date known to be within standard time if possible
    // Or handle potential DST shifts if necessary, though less critical for relative display.
    // Let's use a date within the festival timeframe.
    const baseDate = selectedDay === 'Friday' ? '2025-04-11' : selectedDay === 'Saturday' ? '2025-04-12' : '2025-04-13';
    // If minutes indicate the next day (e.g., > 1440), adjust the date string
    const dateStrDate = minutesFromMidnight >= 1440 ? (selectedDay === 'Friday' ? '2025-04-12' : selectedDay === 'Saturday' ? '2025-04-13' : '2025-04-14') : baseDate;

    const dateStr = `${dateStrDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    try {
        return fromZonedTime(dateStr, festivalTimeZone); // Use corrected function name
    } catch (e) {
        console.error("Error creating festival date:", dateStr, festivalTimeZone, e);
        // Fallback to a generic date if parsing fails
        const fallbackDateStr = `2025-04-11T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
        return fromZonedTime(fallbackDateStr, festivalTimeZone);
    }
  }

   /**
   * Formats the selected slider time (minutes from midnight in festival time) into a string
   * displayed in the *selected* timezone.
   * @param {number} minutes - Minutes from midnight in festival time.
   * @returns {string} Formatted time string (e.g., "3:00 PM")
   */
  function formatSliderTime(minutes) {
    const festivalDate = createFestivalDate(minutes);
    return formatInTimeZone(festivalDate, selectedTimezone || festivalTimeZone, 'h:mm a');
  }

  /**
   * Formats a performance start/end time string (HH:MM festival time) into a string
   * displayed in the *selected* timezone.
   * @param {string | undefined} timeStr - Time string like "23:10"
   * @returns {string} Formatted time string (e.g., "11:10 PM")
   */
  function formatPerformanceTime(timeStr) {
    if (!timeStr) return '-';
    const minutes = timeToMinutes(timeStr);
    const festivalDate = createFestivalDate(minutes);
    return formatInTimeZone(festivalDate, selectedTimezone || festivalTimeZone, 'h:mm a');
  }


  // --- Filtering Logic ---

  // Reactive statement to filter performances based on selected day and time
  $: {
    // Get all unique stages for the selected day first
    const stagesForDay = [...new Set(schedule.filter(p => p.day === selectedDay).map(p => p.stage))].sort();
    stages = stagesForDay; // Update the stages list

    // Filter performances happening at the selected time
    filteredPerformances = schedule.filter(p => {
        if (p.day !== selectedDay) return false; // Ensure correct day

        const startMinutes = timeToMinutes(p.start);
        const endMinutes = timeToMinutes(p.end);

        // Simplified check: selectedTime must be >= start AND < end
        // This works because timeToMinutes handles the wrap-around (e.g., 00:10 becomes 1450)
        return selectedTime >= startMinutes && selectedTime < endMinutes;
    });
  }

  // --- Initialization ---

  onMount(() => {
    // Detect user's timezone
    try {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        selectedTimezone = userTimezone;
        // Update 'Local' option label
        const localOption = availableTimezones.find(tz => tz.label === 'Local'); // Find by label initially
        if (localOption) {
            localOption.label = `Local (${userTimezone.split('/').pop()?.replace('_', ' ') || userTimezone})`;
            localOption.value = userTimezone; // Set value so selection works
            availableTimezones = [...availableTimezones]; // Trigger reactivity
        }
    } catch (e) {
        console.error("Could not detect user timezone:", e);
        selectedTimezone = festivalTimeZone; // Fallback to festival time
        const localOption = availableTimezones.find(tz => tz.label === 'Local');
         if (localOption) {
            localOption.label = `Local (Unknown)`;
            localOption.value = festivalTimeZone; // Fallback value
            availableTimezones = [...availableTimezones];
         }
    }


    // Set initial slider time based on current time
    const now = new Date();
    const nowInFestivalTime = toZonedTime(now, festivalTimeZone); // Use corrected function name
    const currentHourFestival = nowInFestivalTime.getHours();
    const currentMinuteFestival = nowInFestivalTime.getMinutes();
    let currentTimeMinutesFestival = currentHourFestival * 60 + currentMinuteFestival;

    // Adjust for 'next day' if current time is past midnight festival time
     if (currentHourFestival < 5) { // Treat early morning as part of previous day's schedule
       currentTimeMinutesFestival += 24 * 60;
     }

    // Define slider range (Festival Time)
    const sliderMin = 12 * 60; // 12:00 PM
    const sliderMax = (24 + 2) * 60; // Extend to 2:00 AM (26 * 60 = 1560)

    if (currentTimeMinutesFestival >= sliderMin && currentTimeMinutesFestival <= sliderMax) {
      // Set slider to current time, rounded to nearest 5 minutes
      selectedTime = Math.round(currentTimeMinutesFestival / 5) * 5;
    } else {
      // Keep default if current time is outside typical hours
      selectedTime = 15 * 60; // 3:00 PM Pacific
    }

    // Set selectedDay based on current day in festival time (adjusting for early morning)
    let currentDayIndexFestival = nowInFestivalTime.getDay(); // Sunday=0, Monday=1... Saturday=6

    // If it's early morning (before 5 AM), consider it the end of the *previous* day's schedule
    if (currentHourFestival < 5) {
        currentDayIndexFestival = (currentDayIndexFestival === 0) ? 6 : currentDayIndexFestival - 1;
    }

    // Check if it's actually a festival day based on date (optional, but good practice)
    // const festivalDates = ['2025-04-11', '2025-04-12', '2025-04-13']; // Example dates
    // const currentFestivalDateStr = formatInTimeZone(nowInFestivalTime, festivalTimeZone, 'yyyy-MM-dd');
    // if (festivalDates.includes(currentFestivalDateStr)) { ... }

    if (currentDayIndexFestival === 5) selectedDay = 'Friday'; // Friday
    else if (currentDayIndexFestival === 6) selectedDay = 'Saturday'; // Saturday
    else if (currentDayIndexFestival === 0) selectedDay = 'Sunday'; // Sunday
    else selectedDay = 'Friday'; // Default if not a festival day (e.g., Monday)

  });

  /**
   * Gets the correct livestream link for a stage, handling day-specific links.
   * @param {string} stageName
   * @returns {string | undefined} The YouTube video ID or undefined if no link exists.
   */
  function getLivestreamLink(stageName) {
      const linkData = livestreamLinks[stageName];
      if (typeof linkData === 'string') {
          return linkData; // Standard link
      } else if (typeof linkData === 'object' && linkData !== null) {
          // Day-specific link (e.g., Quasar)
          return linkData[selectedDay];
      }
      return undefined; // No link found
  }

  /**
   * Resets the time slider to the default value (3:00 PM Pacific)
   */
  function resetTimeToDefault() {
    selectedTime = 15 * 60; // Reset to 3:00 PM Pacific (default)
  }

</script>

<svelte:head>
  <title>Coachella 2025 Schedule</title>
  <meta name="description" content="Browse the Coachella 2025 lineup by day, time, and stage with timezone support and livestream links" />
</svelte:head>

<div class="container">
  <h1>Coachella 2025 Schedule</h1>

  <div class="controls">
    <div class="day-selector">
      <label for="day">Day:</label>
      <select bind:value={selectedDay} id="day">
        {#each days as day}
          <option value={day}>{day}</option>
        {/each}
      </select>
    </div>

     <div class="timezone-selector">
      <label for="timezone">Timezone:</label>
      <select bind:value={selectedTimezone} id="timezone">
        {#each availableTimezones as tz}
          <option value={tz.value}>{tz.label}</option>
        {/each}
      </select>
    </div>

    <div class="time-selector">
       <!-- Display time in selected timezone -->
      <label for="time">Time: {formatSliderTime(selectedTime)}</label>
      <div class="time-controls">
        <!-- Time slider from 12 PM (720 min) to 2:00 AM (1560 min -> 26 * 60) festival time -->
        <input
          type="range"
          id="time"
          bind:value={selectedTime}
          min={720}
          max={1560}
          step={5}
        />
        <button class="reset-button" on:click={resetTimeToDefault}>Reset Time</button>
      </div>
    </div>
  </div>

  <div class="schedule-grid">
     <!-- Display time in selected timezone -->
    <h2>Performances around {formatSliderTime(selectedTime)} on {selectedDay}</h2>
    {#if stages.length > 0}
      <ul>
         <!-- Iterate over all stages for the selected day -->
        {#each stages as stage}
          {@const performance = filteredPerformances.find(p => p.stage === stage)}
          {@const liveLink = getLivestreamLink(stage)}
          <li>
            <strong class="stage-name">
              {stage}
              {#if liveLink}
                <a href="https://www.youtube.com/watch?v={liveLink}" target="_blank" title="Watch Livestream for {stage} on {selectedDay}" class="livestream-link" aria-label="Watch Livestream for {stage} on {selectedDay}">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path fill-rule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clip-rule="evenodd" />
                  </svg>
                </a>
              {/if}
            </strong>
            {#if performance}
               <!-- Display performance times in selected timezone -->
              <span>{performance.artist} ({formatPerformanceTime(performance.start)} - {formatPerformanceTime(performance.end)})</span>
            {:else}
              <span>-</span>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
       <!-- This case might not be reached if stages always has items for a selected day -->
      <p>No stages found for {selectedDay}.</p>
    {/if}
  </div>

</div>

<style>
  .container {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 1rem;
    font-family: sans-serif;
  }
  .controls {
    display: grid;
    grid-template-columns: auto auto 1fr; /* Adjust columns for timezone selector */
    gap: 1.5rem; /* Adjust gap */
    margin-bottom: 2rem;
    align-items: center;
  }
  .time-selector {
    /* flex-grow: 1; */ /* No longer needed with grid */
  }
  .time-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    margin-top: 0.5rem;
  }

  .time-controls input[type="range"] {
    flex-grow: 1;
  }

  .reset-button {
    padding: 0.3rem 0.6rem;
    background-color: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .reset-button:hover {
    background-color: #e0e0e0;
  }
  .schedule-grid ul {
    list-style: none;
    padding: 0;
  }
  .schedule-grid li {
    margin-bottom: 0.5rem;
    padding: 0.5rem;
    border: 1px solid #eee;
    border-radius: 4px;
    display: flex; /* Align stage and artist info */
    gap: 1rem;
    align-items: center; /* Vertically align items */
  }
  .stage-name {
    display: inline-flex; /* Use inline-flex for alignment */
    align-items: center;
    gap: 0.5rem; /* Space between name and icon */
    width: 180px; /* Adjust width to accommodate icon */
    flex-shrink: 0; /* Prevent stage name from shrinking */
  }
  .livestream-link svg {
    display: inline-block;
    vertical-align: middle;
    color: red;
    transition: transform 0.2s ease-in-out;
  }
  .livestream-link:hover svg {
      transform: scale(1.2);
  }
  label {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 0.9em;
      font-weight: bold;
  }
  select {
      padding: 0.3rem 0.5rem;
  }
</style>
