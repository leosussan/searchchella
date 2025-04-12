<script>
  import scheduleData from '$lib/schedule.json';
  import { onMount } from 'svelte';
  import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'; // Corrected import
  import { theme } from '$lib/stores';

  // Toggle theme function
  function toggleTheme() {
    theme.update(current => current === 'light' ? 'dark' : 'light');
  }
  
  // Tab state
  let activeTab = 'schedule'; // 'schedule' or 'list'

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
  let searchTerm = '';
  /** @type {typeof scheduleData} */
  let chronologicalPerformances = [];
  let hideEmptyStages = true; // Default to hiding empty stages
  let hideNoStreamStages = false; // Default to showing all stages including those without livestreams

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
    
    // Filter performances happening at the selected time
    const performancesAtTime = schedule.filter(p => {
        if (p.day !== selectedDay) return false; // Ensure correct day

        const startMinutes = timeToMinutes(p.start);
        const endMinutes = timeToMinutes(p.end);

        // Simplified check: selectedTime must be >= start AND < end
        // This works because timeToMinutes handles the wrap-around (e.g., 00:10 becomes 1450)
        return selectedTime >= startMinutes && selectedTime < endMinutes;
    });
    
    filteredPerformances = performancesAtTime;
    
    // Apply filters to stages
    let filteredStages = stagesForDay;
    
    // If hideEmptyStages is true, only include stages that have performances
    if (hideEmptyStages) {
      const stagesWithPerformances = performancesAtTime.map(p => p.stage);
      filteredStages = filteredStages.filter(stage => stagesWithPerformances.includes(stage));
    }
    
    // If hideNoStreamStages is true, hide stages without livestreams and before 16:00 Pacific
    if (hideNoStreamStages) {
      // Hide Yuma stage completely (no livestream)
      filteredStages = filteredStages.filter(stage => stage !== 'Yuma');
      
      // Hide all stages before 16:00 Pacific (960 minutes)
      if (selectedTime < 960) {
        filteredStages = [];
      } else {
        // Only keep stages with livestream links
        filteredStages = filteredStages.filter(stage => {
          const link = getLivestreamLink(stage);
          return link !== undefined;
        });
      }
    }
    
    stages = filteredStages;
  }

  // Sort all performances chronologically across all days
  $: {
    chronologicalPerformances = [...schedule].sort((a, b) => {
      // First sort by day
      const dayOrder = { 'Friday': 0, 'Saturday': 1, 'Sunday': 2 };
      if (dayOrder[a.day] !== dayOrder[b.day]) {
        return dayOrder[a.day] - dayOrder[b.day];
      }
      
      // Then sort by start time
      return timeToMinutes(a.start) - timeToMinutes(b.start);
    });
  }

  // Filter performances based on search term
  $: filteredChronologicalPerformances = chronologicalPerformances.filter(performance => {
    if (!searchTerm.trim()) return true;
    
    // Case-insensitive search in artist name
    return performance.artist.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // --- Initialization ---

  // Consolidate time initialization into a single function
  function setInitialTimeAndDay() {
    const now = new Date();
    const nowInFestivalTime = toZonedTime(now, festivalTimeZone);
    const currentHourFestival = nowInFestivalTime.getHours();
    const currentMinuteFestival = nowInFestivalTime.getMinutes();
    let currentTimeMinutesFestival = currentHourFestival * 60 + currentMinuteFestival;

    // Adjust for early morning hours
    if (currentHourFestival < 5) {
      currentTimeMinutesFestival += 24 * 60;
    }

    // Set time based on current time or default
    const sliderMin = 12 * 60;
    const sliderMax = (24 + 2) * 60;
    selectedTime = (currentTimeMinutesFestival >= sliderMin && currentTimeMinutesFestival <= sliderMax)
      ? Math.round(currentTimeMinutesFestival / 5) * 5
      : 15 * 60;

    // Get the day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const dayOfWeek = nowInFestivalTime.getDay();
    
    // Get the hour to determine if we're in the early morning hours of the next day
    const hour = nowInFestivalTime.getHours();
    
    // Default to Friday (festival day 1)
    selectedDay = 'Friday';
    
    // If it's Saturday after 3:00 AM PT and before Sunday 3:00 AM PT, show Saturday
    if ((dayOfWeek === 6 && hour >= 3) || (dayOfWeek === 0 && hour < 3)) {
      selectedDay = 'Saturday';
    }
    // If it's Sunday after 3:00 AM PT and before Monday 3:00 AM PT, show Sunday
    else if ((dayOfWeek === 0 && hour >= 3) || (dayOfWeek === 1 && hour < 3)) {
      selectedDay = 'Sunday';
    }
  }

  onMount(() => {
    // Detect user's timezone
    try {
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      selectedTimezone = userTimezone;
      
      const localOption = availableTimezones.find(tz => tz.label === 'Local');
      if (localOption) {
        localOption.label = `Local (${userTimezone.split('/').pop()?.replace('_', ' ') || userTimezone})`;
        localOption.value = userTimezone;
        availableTimezones = [...availableTimezones];
      }
      
      // Set initial time and day in one place
      setInitialTimeAndDay();
    } catch (e) {
      console.error("Could not detect user timezone:", e);
      selectedTimezone = festivalTimeZone; // Fallback to festival time
      const localOption = availableTimezones.find(tz => tz.label === 'Local');
       if (localOption) {
          localOption.label = `Local (Unknown)`;
          localOption.value = festivalTimeZone; // Fallback value
          availableTimezones = [...availableTimezones];
       }
       
      // Still set initial time and day even if timezone detection fails
      setInitialTimeAndDay();
    }
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
   * Resets the time slider based on current time, using the same logic as initial load
   */
  function resetTimeToDefault() {
    setInitialTimeAndDay();
  }

</script>

<svelte:head>
  <title>Coachella 2025 Schedule</title>
  <meta name="description" content="Browse the Coachella 2025 lineup by day, time, and stage with timezone support and livestream links" />
</svelte:head>

<div class="container">
  <div class="header-container">
    <h1>Coachella 2025 Schedule</h1>
    <button class="theme-toggle" on:click={toggleTheme} aria-label="Toggle dark mode">
      {#if $theme === 'light'}
        <!-- Sun icon for light mode -->
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      {:else}
        <!-- Moon icon for dark mode -->
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      {/if}
    </button>
  </div>

  <!-- Tab navigation -->
  <div class="tabs-container">
    <button 
      class="tab-button {activeTab === 'schedule' ? 'active' : ''}" 
      on:click={() => activeTab = 'schedule'}
      aria-selected={activeTab === 'schedule'}
      role="tab"
    >
      Schedule View
    </button>
    <button 
      class="tab-button {activeTab === 'list' ? 'active' : ''}" 
      on:click={() => activeTab = 'list'}
      aria-selected={activeTab === 'list'}
      role="tab"
    >
      All Performances
    </button>
  </div>

  <!-- Tab 1: Schedule View -->
  {#if activeTab === 'schedule'}
  <div class="controls">
    <div class="day-selector">
      <label for="day">Day:</label>
      <select bind:value={selectedDay} id="day">
        {#each days as day}
          <option value={day}>{day}</option>
        {/each}
      </select>
    </div>

    <div class="time-selector">
      <div class="time-label-container">
        <label for="time">Time: {formatSliderTime(selectedTime)}</label>
        <div class="timezone-inline-selector">
          <select bind:value={selectedTimezone} id="timezone" aria-label="Select timezone">
            {#each availableTimezones as tz}
              <option value={tz.value}>{tz.label}</option>
            {/each}
          </select>
        </div>
      </div>
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
    
    <div class="toggle-container">
      <label for="hide-empty" class="toggle-label">
        <input 
          type="checkbox" 
          id="hide-empty" 
          bind:checked={hideEmptyStages}
        />
        <span class="toggle-text">Hide empty stages</span>
      </label>
      
      <label for="hide-no-stream" class="toggle-label">
        <input 
          type="checkbox" 
          id="hide-no-stream" 
          bind:checked={hideNoStreamStages}
        />
        <span class="toggle-text">Hide stages without livestream</span>
      </label>
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
          <li data-stage={stage}>
            <div class="stage-name-container">
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
            </div>
            {#if performance}
              <div class="performance-details">
                <span class="act-artist">{performance.artist}</span>
                <span class="act-time">{formatPerformanceTime(performance.start)} - {formatPerformanceTime(performance.end)}</span>
              </div>
            {:else}
              <span class="no-performance">No performance at this time</span>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
       <!-- This case might not be reached if stages always has items for a selected day -->
      <p>No stages found for {selectedDay}.</p>
    {/if}
  </div>
  {/if}

  <!-- Tab 2: All Performances List -->
  {#if activeTab === 'list'}
  <div class="acts-list-container">
    <div class="search-container">
      <input 
        type="text" 
        bind:value={searchTerm} 
        placeholder="Search for an artist..." 
        aria-label="Search for an artist"
      />
      {#if searchTerm.trim()}
        <button class="clear-search" on:click={() => searchTerm = ''} aria-label="Clear search">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      {/if}
    </div>
    
    {#if filteredChronologicalPerformances.length === 0}
      <p class="no-results">No performances found matching "{searchTerm}"</p>
    {:else}
      <div class="acts-list">
        {#each filteredChronologicalPerformances as performance}
          {@const liveLink = getLivestreamLink(performance.stage)}
          <div class="act-item" data-stage={performance.stage}>
            <div class="act-details">
              <span class="act-artist">{performance.artist}</span>
              <span class="act-stage">
                {performance.stage}
                {#if liveLink}
                  <a href="https://www.youtube.com/watch?v={liveLink}" target="_blank" title="Watch Livestream for {performance.stage} on {performance.day}" class="livestream-link" aria-label="Watch Livestream for {performance.stage} on {performance.day}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      <path fill-rule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clip-rule="evenodd" />
                    </svg>
                  </a>
                {/if}
              </span>
            </div>
            <div class="act-day-time">
              <span class="act-day">{performance.day}</span>
              <span class="act-time">{formatPerformanceTime(performance.start)} - {formatPerformanceTime(performance.end)}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  {/if}

</div>

<style>
  /* Add dark mode variables */
  :root {
    --primary-color: #3a86ff;
    --primary-light: #61a0ff;
    --primary-dark: #2667cc;
    --text-color: #333;
    --background-color: #f9f9f9;
    --card-background: #ffffff;
    --border-radius: 8px;
    --box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    --transition: all 0.3s ease;
    --secondary-background: #f5f5f5;
    
    /* Stage-specific colors - more subtle and less harsh on the eyes */
    --stage-coachella: #e63946;     /* Slightly muted red */
    --stage-outdoor: #d4a72a;       /* Darker, more muted gold */
    --stage-sahara: #90be6d;        /* Softer green */
    --stage-mojave: #43a6c6;        /* Softer blue */
    --stage-gobi: #8d6a9f;          /* Softer purple */
    --stage-sonora: #d66ba0;        /* Softer pink */
    --stage-yuma: #4cc9f0;          /* Softer teal */
    --stage-quasar: #f3a261;        /* Softer orange */
  }

  /* Dark mode variables */
  :root[data-theme="dark"] {
    --primary-color: #4d8eff;
    --primary-light: #75adff;
    --primary-dark: #3a6bc7;
    --text-color: #e0e0e0;
    --background-color: #121212;
    --card-background: #1e1e1e;
    --box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    --secondary-background: #2a2a2a;
    
    /* Slightly brighter stage colors for dark mode */
    --stage-coachella: #ff5a67;
    --stage-outdoor: #ffc234;
    --stage-sahara: #a5d68a;
    --stage-mojave: #5bbfe0;
    --stage-gobi: #a57fb9;
    --stage-sonora: #f182b6;
    --stage-yuma: #62d5fc;
    --stage-quasar: #ffb57d;
  }

  /* Header container for title and theme toggle */
  .header-container {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    margin-bottom: 1.5rem;
  }

  /* Theme toggle button */
  .theme-toggle {
    position: absolute;
    right: 0;
    background: none;
    border: none;
    color: var(--primary-color);
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: var(--transition);
  }

  .theme-toggle:hover {
    background-color: rgba(58, 134, 255, 0.1);
    transform: rotate(15deg);
  }

  .container {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 1.5rem;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text-color);
    background-color: var(--background-color);
    border-radius: var(--border-radius);
    box-shadow: var(--box-shadow);
  }

  h1 {
    font-size: 2.2rem;
    margin-bottom: 1.5rem;
    color: var(--primary-color);
    text-align: center;
  }

  h2 {
    font-size: 1.4rem;
    margin-bottom: 1rem;
    color: var(--primary-dark);
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2.5rem;
    align-items: start;
  }

  .day-selector, .time-selector {
    background-color: var(--card-background);
    padding: 1rem;
    border-radius: var(--border-radius);
    box-shadow: var(--box-shadow);
  }

  /* Add these new styles for the combined time and timezone selector */
  .time-label-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .timezone-inline-selector {
    margin-left: 0.5rem;
  }

  .timezone-inline-selector select {
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
    width: auto;
    min-width: 120px;
  }

  .time-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    margin-top: 0.8rem;
  }

  .time-controls input[type="range"] {
    flex-grow: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: #ddd;
    border-radius: 3px;
    outline: none;
  }

  .time-controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--primary-color);
    border-radius: 50%;
    cursor: pointer;
    transition: var(--transition);
  }

  .time-controls input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: var(--primary-color);
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: var(--transition);
  }

  .time-controls input[type="range"]::-webkit-slider-thumb:hover {
    background: var(--primary-light);
    transform: scale(1.1);
  }

  .time-controls input[type="range"]::-moz-range-thumb:hover {
    background: var(--primary-light);
    transform: scale(1.1);
  }

  .reset-button {
    padding: 0.5rem 0.8rem;
    background-color: var(--primary-color);
    color: white;
    border: none;
    border-radius: var(--border-radius);
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
    transition: var(--transition);
  }

  .reset-button:hover {
    background-color: var(--primary-light);
    transform: translateY(-2px);
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-color);
  }

  select {
    width: 100%;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--secondary-background);
    border-radius: var(--border-radius);
    font-size: 1rem;
    background-color: var(--card-background);
    color: var(--text-color);
    transition: var(--transition);
    cursor: pointer;
  }

  select:focus {
    border-color: var(--primary-color);
    outline: none;
    box-shadow: 0 0 0 2px rgba(58, 134, 255, 0.2);
  }

  .schedule-grid {
    background-color: var(--card-background);
    padding: 1.5rem;
    border-radius: var(--border-radius);
    box-shadow: var(--box-shadow);
  }

  .schedule-grid ul {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .schedule-grid li {
    margin-bottom: 0;
    padding: 1rem;
    border: none;
    background-color: var(--secondary-background);
    border-radius: var(--border-radius);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: var(--transition);
    border-left: 4px solid #ccc; /* Changed from border-top to border-left to match act-item */
  }

  /* Stage-specific styling */
  .schedule-grid li[data-stage="Coachella Stage"] {
    border-left-color: var(--stage-coachella);
  }

  .schedule-grid li[data-stage="Outdoor Theatre"] {
    border-left-color: var(--stage-outdoor);
  }

  .schedule-grid li[data-stage="Sahara"] {
    border-left-color: var(--stage-sahara);
  }

  .schedule-grid li[data-stage="Mojave"] {
    border-left-color: var(--stage-mojave);
  }

  .schedule-grid li[data-stage="Gobi"] {
    border-left-color: var(--stage-gobi);
  }

  .schedule-grid li[data-stage="Sonora"] {
    border-left-color: var(--stage-sonora);
  }

  .schedule-grid li[data-stage="Yuma"] {
    border-left-color: var(--stage-yuma);
  }

  .schedule-grid li[data-stage="Quasar"] {
    border-left-color: var(--stage-quasar);
  }

  .schedule-grid li:hover {
    transform: translateX(3px); /* Changed from translateY to translateX to match act-item */
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  /* Add a subtle text shadow in dark mode only */
  :root[data-theme="dark"] .schedule-grid li span {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  /* Add this to enhance the artist name visibility */
  /* Add these new styles for the updated schedule grid */
  .stage-name-container {
    margin-bottom: 0.3rem;
  }

  .performance-details {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .no-performance {
    color: var(--text-color);
    opacity: 0.6;
    font-style: italic;
  }

  /* Update these existing styles to be shared between both views */
  .stage-name, .act-stage {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.1rem;
    color: var(--text-color);
    font-weight: 500;
  }

  /* Make sure the artist name styling is consistent across both views */
  .act-artist {
    font-weight: 600;
    font-size: 1.05rem;
    color: var(--text-color);
  }

  /* Make sure the time styling is consistent across both views */
  .act-time {
    font-size: 0.85rem;
    color: var(--text-color);
    opacity: 0.8;
  }

  /* Stage-specific text colors */
  li[data-stage="Coachella Stage"] .stage-name {
    color: var(--stage-coachella);
  }

  li[data-stage="Outdoor Theatre"] .stage-name {
    color: var(--stage-outdoor);
  }

  li[data-stage="Sahara"] .stage-name {
    color: var(--stage-sahara);
  }

  li[data-stage="Mojave"] .stage-name {
    color: var(--stage-mojave);
  }

  li[data-stage="Gobi"] .stage-name {
    color: var(--stage-gobi);
  }

  li[data-stage="Sonora"] .stage-name {
    color: var(--stage-sonora);
  }

  li[data-stage="Yuma"] .stage-name {
    color: var(--stage-yuma);
  }

  li[data-stage="Quasar"] .stage-name {
    color: var(--stage-quasar);
  }

  .livestream-link svg {
    display: inline-block;
    vertical-align: middle;
    color: #ff0000;
    transition: transform 0.2s ease-in-out;
  }

  .livestream-link:hover svg {
    transform: scale(1.3);
  }

  /* Toggle switch styling */
  .toggle-container {
    background-color: var(--card-background);
    padding: 1rem;
    border-radius: var(--border-radius);
    box-shadow: var(--box-shadow);
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    cursor: pointer;
    margin-bottom: 0;
  }

  .toggle-label input[type="checkbox"] {
    margin-right: 0.8rem;
    cursor: pointer;
    height: 18px;
    width: 18px;
    accent-color: var(--primary-color);
  }

  .toggle-text {
    font-weight: 600;
    font-size: 0.95rem;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .controls {
      grid-template-columns: 1fr;
    }
    
    .schedule-grid ul {
      grid-template-columns: 1fr;
    }
    
    h1 {
      font-size: 1.8rem;
    }
    
    .performance-details {
      width: 100%;
    }
    
    .toggle-container {
      grid-column: 1 / -1; /* Make it full width on mobile */
    }
  }
  
  /* Adjust for mobile */
  @media (max-width: 480px) {
    .time-label-container {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
    
    .timezone-inline-selector {
      margin-left: 0;
      width: 100%;
    }
    
    .timezone-inline-selector select {
      width: 100%;
    }
  }

  /* Tab Styles */
  .tabs-container {
    display: flex;
    margin-bottom: 2rem;
    border-bottom: 2px solid var(--secondary-background);
  }

  .tab-button {
    padding: 0.8rem 1.5rem;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-color);
    cursor: pointer;
    transition: var(--transition);
    opacity: 0.7;
  }

  .tab-button:hover {
    opacity: 1;
    background-color: var(--secondary-background);
  }

  .tab-button.active {
    border-bottom-color: var(--primary-color);
    opacity: 1;
    font-weight: 600;
  }

  /* Acts List Styles */
  .acts-list-container {
    background-color: var(--card-background);
    padding: 1.5rem;
    border-radius: var(--border-radius);
    box-shadow: var(--box-shadow);
    width: 100%;
    box-sizing: border-box;
  }

  .search-container {
    position: relative;
    margin-bottom: 1.5rem;
    width: 100%;
    box-sizing: border-box;
  }

  .search-container input {
    width: 100%;
    padding: 0.8rem 1rem;
    border: 1px solid var(--secondary-background);
    border-radius: var(--border-radius);
    font-size: 1rem;
    background-color: var(--card-background);
    color: var(--text-color);
    transition: var(--transition);
    box-sizing: border-box; /* Add this to include padding in width calculation */
  }

  .search-container input:focus {
    border-color: var(--primary-color);
    outline: none;
    box-shadow: 0 0 0 2px rgba(58, 134, 255, 0.2);
  }

  .clear-search {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-color);
    cursor: pointer;
    padding: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: var(--transition);
  }

  .clear-search:hover {
    opacity: 1;
  }

  .no-results {
    text-align: center;
    padding: 2rem;
    color: var(--text-color);
    opacity: 0.7;
  }

  .acts-list {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .act-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background-color: var(--secondary-background);
    border-radius: var(--border-radius);
    transition: var(--transition);
    border-left: 4px solid #ccc; /* Default border color */
  }

  /* Stage-specific styling for act items */
  .act-item[data-stage="Coachella Stage"] {
    border-left-color: var(--stage-coachella);
  }

  .act-item[data-stage="Outdoor Theatre"] {
    border-left-color: var(--stage-outdoor);
  }

  .act-item[data-stage="Sahara"] {
    border-left-color: var(--stage-sahara);
  }

  .act-item[data-stage="Mojave"] {
    border-left-color: var(--stage-mojave);
  }

  .act-item[data-stage="Gobi"] {
    border-left-color: var(--stage-gobi);
  }

  .act-item[data-stage="Sonora"] {
    border-left-color: var(--stage-sonora);
  }

  .act-item[data-stage="Yuma"] {
    border-left-color: var(--stage-yuma);
  }

  .act-item[data-stage="Quasar"] {
    border-left-color: var(--stage-quasar);
  }

  .act-item:hover {
    transform: translateX(3px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .act-day-time {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    align-items: flex-end; /* Align to the right side */
  }

  .act-day {
    font-weight: 500;
    font-size: 0.9rem;
    color: var(--primary-color);
  }

  .act-time {
    font-size: 0.85rem;
    color: var(--text-color);
    opacity: 0.8;
  }

  .act-details {
    display: flex;
    flex-direction: column;
    align-items: flex-start; /* Align to the left side */
    gap: 0.3rem;
  }

  .act-artist {
    font-weight: 600;
    font-size: 1.05rem;
    color: var(--text-color);
  }

  .act-stage {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
    opacity: 0.8;
  }

  /* Responsive adjustments for acts list */
  @media (max-width: 768px) {
    .act-item {
      flex-direction: row; /* Explicitly set to row instead of column */
      justify-content: space-between;
      align-items: flex-start; /* Align items to the top */
      gap: 0.8rem;
    }
    
    .act-day-time {
      align-items: flex-end; /* Right-align the content */
      text-align: right; /* Ensure text is right-aligned */
    }
    
    .act-details {
      align-items: flex-start; /* Left-align the content */
      text-align: left; /* Ensure text is left-aligned */
      width: auto; /* Remove full width */
    }
  }
</style>
