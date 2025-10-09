document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = '/api';
  const GIPHY_API_KEY = 'YOUR_GIPHY_API_KEY'; // Replace with your actual GIPHY API key

  // --- ARRAYS FOR ANIMATIONS ---
  const GENIE_IMAGES = [
    "https://ik.imagekit.io/tuf7vvv2d/Gemini_Generated_Image_2fh6742fh6742fh6-removebg.png?updatedAt=1759208045860"
  ];
  const MOTIVATIONAL_QUOTES = [
    "The pain you feel today is the strength you feel tomorrow.",
    "Your only limit is you.",
    "Push yourself, because no one else is going to do it for you.",
    "Success starts with self-discipline.",
    "The body achieves what the mind believes."
  ];
  const BIG_QUOTES = [
    "The only bad workout is the one that didn’t happen.",
    "Your body can stand almost anything. It’s your mind that you have to convince.",
    "Success isn’t always about greatness. It’s about consistency.",
    "Strive for progress, not perfection.",
    "Wake up with determination. Go to bed with satisfaction."
  ];

  // --- GLOBAL STATE VARIABLES ---
  let imageInterval, quoteInterval, bigQuoteInterval;
  let currentWorkoutPlan = null;
  let currentDayIndex = 0;

  // --- GLOBAL HELPER: Get Auth Token ---
  function getAuthToken() {
    return localStorage.getItem('authToken');
  }

  // --- GLOBAL HELPER: Fetch with Auth ---
  async function fetchWithAuth(url, options = {}) {
    const token = getAuthToken();
    if (!token) {
      throw new Error('No authentication token found.');
    }
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
    return fetch(url, options);
  }

  // --- GENIE ANIMATION HELPER ---
  function startGenieAnimation(imageId) {
    const genieImage = document.getElementById(imageId);
    if (genieImage && window.matchMedia('(min-width: 992px)').matches) {
      let imageIndex = 0;
      if (imageInterval) clearInterval(imageInterval);
      imageInterval = setInterval(() => {
        imageIndex = (imageIndex + 1) % GENIE_IMAGES.length;
        genieImage.style.opacity = 0;
        setTimeout(() => {
          if (genieImage) {
            genieImage.src = GENIE_IMAGES[imageIndex];
            genieImage.style.opacity = 1;
          }
        }, 500);
      }, 5000);
    }
  }

  // --- PAGE-SPECIFIC LOGIC ---

  // 1. Sign-Up / Sign-In Page (index.html)
  if (document.getElementById('signInView')) {
    startGenieAnimation('genieImage');
    startGenieAnimation('genieImage2');
    const signUpView = document.getElementById('signUpView');
    const signInView = document.getElementById('signInView');
    const showSignInBtn = document.getElementById('showSignIn');
    const showSignUpBtn = document.getElementById('showSignUp');

    if (showSignInBtn && showSignUpBtn) {
      showSignInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signUpView.classList.add('d-none');
        signInView.classList.remove('d-none');
      });

      showSignUpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signInView.classList.add('d-none');
        signUpView.classList.remove('d-none');
      });
    }

    document.getElementById('signUpForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('signUpUsername').value;
      const password = document.getElementById('signUpPassword').value;
      try {
        const response = await fetch(`${API_BASE_URL}/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
          alert('Sign up successful! Please sign in.');
          showSignInBtn.click();
        } else {
          alert(`Sign Up Failed: ${data.error}`);
        }
      } catch (error) {
        alert('Could not connect to the server.');
      }
    });

    document.getElementById('signInForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('signInUsername').value;
      const password = document.getElementById('signInPassword').value;
      try {
        const response = await fetch(`${API_BASE_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok) {
          localStorage.setItem('authToken', data.token);
          if (data.profileExists) {
            window.location.href = 'home.html';
          } else {
            window.location.href = 'details.html';
          }
        } else {
          alert(`Login Failed: ${data.error}`);
        }
      } catch (error) {
        alert('Could not connect to the server.');
      }
    });
  }

  // 2. Multi-Step Details Page (details.html)
  if (document.getElementById('multiStepForm')) {
    startGenieAnimation('genieImage');
    const formContainer = document.getElementById('formContainer');
    const loadingContainer = document.getElementById('loadingContainer');
    const form = document.getElementById('multiStepForm');
    const steps = Array.from(form.querySelectorAll('.form-step'));
    const progressBar = document.getElementById('progressBar');
    let currentStep = 0;
    const formData = {};

    const showStep = (stepIndex) => {
      steps.forEach((step, index) => {
        step.classList.toggle('active-step', index === stepIndex);
      });
      const progress = ((stepIndex + 1) / steps.length) * 100;
      progressBar.style.width = `${progress}%`;
    };

    form.addEventListener('click', (e) => {
      if (e.target.matches('.next-btn')) {
        const currentStepDiv = steps[currentStep];
        const inputs = [...currentStepDiv.querySelectorAll('[data-field][required]')];
        if (inputs.some(input => !input.value.trim())) {
          alert('Please fill in all required fields before continuing.');
          return;
        }
        if (currentStep < steps.length - 1) {
          currentStep++;
          showStep(currentStep);
        }
      }
      if (e.target.matches('.prev-btn')) {
        if (currentStep > 0) {
          currentStep--;
          showStep(currentStep);
        }
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const allInputs = form.querySelectorAll('[data-field]');
      allInputs.forEach(input => {
        const field = input.dataset.field;
        if (input.type === 'radio') {
          if (input.checked) formData[field] = input.value;
        } else {
          formData[field] = input.value;
        }
      });

      formContainer.classList.add('d-none');
      loadingContainer.classList.remove('d-none');
      startLoadingAnimations();

      try {
        const response = await fetch(`${API_BASE_URL}/update-profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
          },
          body: JSON.stringify(formData)
        });

        const planData = await response.json();
        if (!response.ok) {
          throw new Error(planData.error || 'Failed to generate plan.');
        }

        stopLoadingAnimations();
        sessionStorage.setItem('generatedWorkoutPlan', JSON.stringify(planData));
        window.location.href = 'workout.html';

      } catch (error) {
        stopLoadingAnimations();
        alert(`Error: ${error.message}`);
        loadingContainer.classList.add('d-none');
        formContainer.classList.remove('d-none');
      }
    });

    showStep(currentStep);
  }

  // 3. Home Page (home.html)
  if (document.querySelector('.stat-card')) {
    startGenieAnimation('genieImage');
    const token = getAuthToken();
    if (!token) {
      window.location.href = 'index.html';
    }

    const viewWorkoutBtn = document.getElementById('viewWorkoutBtn');

    async function initializeHomePage() {
      try {
        const homeDataResponse = await fetchWithAuth(`${API_BASE_URL}/home-data`);
        if (!homeDataResponse.ok) throw new Error('Could not fetch user data.');
        const data = await homeDataResponse.json();

        document.getElementById('welcomeMessage').textContent = `Welcome back, ${data.name}!`;
        document.getElementById('welcomeMessage2').textContent = `Welcome back, ${data.name}!`;
        document.getElementById('currentWeightDisplay').textContent = `${data.weight} kg`;
        document.getElementById('heightDisplay').textContent = `${data.height} cm`;
        document.getElementById('bmiDisplay').textContent = data.bmi;
        document.getElementById('weekCountDisplay').textContent = `Week ${data.weekCount}`;
        document.getElementById('nextWeekBtn').textContent = `Start Week ${data.weekCount + 1}`;

        try {
          const workoutResponse = await fetchWithAuth(`${API_BASE_URL}/active-workout`);
          if (!workoutResponse.ok) {
            throw new Error('No active workout.');
          }
          const workoutData = await workoutResponse.json();
          viewWorkoutBtn.innerHTML = `<i class="fas fa-dumbbell"></i> Go to Workout`;
          viewWorkoutBtn.onclick = () => {
            sessionStorage.setItem('generatedWorkoutPlan', JSON.stringify(workoutData));
            window.location.href = 'workout.html';
          };

        } catch (workoutError) {
          viewWorkoutBtn.innerHTML = `<i class="fas fa-magic"></i> Generate First Workout`;
          viewWorkoutBtn.onclick = generateFirstWorkout;
        }

      } catch (error) {
        alert(error.message);
        window.location.href = 'index.html';
      }
    }

    async function generateFirstWorkout() {
      viewWorkoutBtn.innerHTML = `Generating...`;
      viewWorkoutBtn.disabled = true;
      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/generate-workout`, {
          method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to generate workout.');

        const newPlan = await response.json();
        sessionStorage.setItem('generatedWorkoutPlan', JSON.stringify(newPlan));
        window.location.href = 'workout.html';
      } catch (error) {
        alert(error.message);
        viewWorkoutBtn.innerHTML = `<i class="fas fa-magic"></i> Generate First Workout`;
        viewWorkoutBtn.disabled = false;
      }
    }

    initializeHomePage();

    document.getElementById('nextWeekBtn').addEventListener('click', () => {
      window.location.href = 'next-week.html';
    });

    document.getElementById('logoutButtonMobile').addEventListener('click', () => {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = 'index.html';
    });
  }

  // 4. Next Week Page
  if (document.getElementById('nextWeekForm')) {
    startGenieAnimation('genieImage');
    const token = getAuthToken();
    if (!token) {
      window.location.href = 'index.html';
    }

    const formContainer = document.getElementById('formContainer');
    const loadingContainer = document.getElementById('loadingContainer');
    const form = document.getElementById('nextWeekForm');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newWeight = document.getElementById('newWeightInput').value;
      if (!newWeight || isNaN(newWeight) || newWeight <= 0) {
        return alert("Please enter a valid number for your weight.");
      }

      formContainer.classList.add('d-none');
      loadingContainer.classList.remove('d-none');
      startLoadingAnimations();

      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/start-next-week`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newWeight })
        });

        if (!response.ok) throw new Error('Failed to generate next week\'s plan.');

        const newPlan = await response.json();
        sessionStorage.setItem('generatedWorkoutPlan', JSON.stringify(newPlan));
        window.location.href = 'workout.html';

      } catch (error) {
        stopLoadingAnimations();
        alert(error.message);
        loadingContainer.classList.add('d-none');
        formContainer.classList.remove('d-none');
      }
    });
  }

  // 5. Workout Dashboard Page (workout.html)
  if (document.getElementById('dashboardContainer')) {
    startGenieAnimation('genieImage');
    const token = getAuthToken();
    if (!token) {
      window.location.href = 'index.html';
    }

    async function loadActiveWorkout() {
      const justGeneratedPlan = sessionStorage.getItem('generatedWorkoutPlan');
      if (justGeneratedPlan) {
        initializeDashboard(JSON.parse(justGeneratedPlan));
        sessionStorage.removeItem('generatedWorkoutPlan');
        return;
      }

      try {
        const response = await fetchWithAuth(`${API_BASE_URL}/active-workout`);
        if (!response.ok) throw new Error('No active workout found. Go to Home to generate a plan.');

        const planData = await response.json();
        initializeDashboard(planData);
      } catch (error) {
        alert(error.message);
        window.location.href = 'home.html';
      }
    }

    loadActiveWorkout();

    const logoutButtons = [
      document.getElementById('logoutButtonSidebar'),
      document.getElementById('logoutButtonMobile')
    ];

    logoutButtons.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          localStorage.clear();
          sessionStorage.clear();
          window.location.href = 'index.html';
        });
      }
    });
  }

  // --- HELPER FUNCTIONS ---

  function startLoadingAnimations() {
    startGenieAnimation('genieImage');
    const quoteElement = document.getElementById('motivationalQuote');
    let quoteIndex = 0;

    if (quoteElement) {
      if (quoteInterval) clearInterval(quoteInterval);
      quoteInterval = setInterval(() => {
        quoteElement.style.opacity = 0;
        setTimeout(() => {
          quoteIndex = (quoteIndex + 1) % MOTIVATIONAL_QUOTES.length;
          quoteElement.textContent = MOTIVATIONAL_QUOTES[quoteIndex];
          quoteElement.style.opacity = 1;
        }, 500);
      }, 2000);
    }
  }

  function stopLoadingAnimations() {
    clearInterval(imageInterval);
    clearInterval(quoteInterval);
  }

  function initializeDashboard(planData) {
    currentWorkoutPlan = planData;
    const dashboardContainer = document.getElementById('dashboardContainer');
    const planSummary = document.getElementById('planSummary');
    const mobilePlanSummary = document.getElementById('mobilePlanSummary');

    if (planSummary) {
      planSummary.textContent = currentWorkoutPlan.summary;
      if (window.matchMedia('(max-width: 991px)').matches) {
        const truncated = currentWorkoutPlan.summary.substring(0, 150) + '...';
        planSummary.textContent = truncated;
      }
    }

    if (mobilePlanSummary && window.matchMedia('(max-width: 991px)').matches) {
      mobilePlanSummary.textContent = currentWorkoutPlan.summary;
    }

    if (dashboardContainer) dashboardContainer.classList.remove('d-none');

    renderDayView(0);
    startQuoteCycling();

    document.getElementById('prevDayBtn').addEventListener('click', () => changeDay(-1));
    document.getElementById('nextDayBtn').addEventListener('click', () => changeDay(1));
    document.getElementById('backBtn').addEventListener('click', hideDetailView);

    const showSummaryBtn = document.getElementById('showSummaryBtn');
    const closeSummaryBtn = document.getElementById('closeSummaryBtn');
    const summaryModal = document.getElementById('summaryModal');

    if (showSummaryBtn && closeSummaryBtn && summaryModal) {
      showSummaryBtn.addEventListener('click', () => {
        if (currentWorkoutPlan && currentWorkoutPlan.summary) {
          document.getElementById('mobilePlanSummary').textContent = currentWorkoutPlan.summary;
          summaryModal.classList.add('visible');
          summaryModal.style.opacity = 1;
          summaryModal.style.pointerEvents = 'all';
        }
      });

      closeSummaryBtn.addEventListener('click', () => {
        summaryModal.classList.remove('visible');
        summaryModal.style.opacity = 0;
        summaryModal.style.pointerEvents = 'none';
      });

      summaryModal.addEventListener('click', (e) => {
        if (e.target === summaryModal) {
          summaryModal.classList.remove('visible');
          summaryModal.style.opacity = 0;
          summaryModal.style.pointerEvents = 'none';
        }
      });
    }
  }

  function renderDayView(dayIndex) {
    const dayData = currentWorkoutPlan.weeklySplit[dayIndex];
    document.getElementById('dayTitle').textContent = `${dayData.day} - ${dayData.focus}`;

    const exerciseList = document.getElementById('exerciseList');
    exerciseList.innerHTML = '';

    if (!dayData.exercises || dayData.exercises.length === 0) {
      exerciseList.innerHTML = `<div class="exercise-item"><h5>Rest Day</h5><p>Time to recover and grow stronger!</p></div>`;
      return;
    }

    dayData.exercises.forEach((exercise, index) => {
      const item = document.createElement('div');
      item.className = 'exercise-item';
      item.innerHTML = `<h5>${exercise.name}</h5><p>${exercise.sets} sets of ${exercise.reps} reps</p>`;
      item.addEventListener('click', () => showDetailView(index));
      exerciseList.appendChild(item);
    });
  }

  async function showDetailView(exerciseIndex) {
    const exercise = currentWorkoutPlan.weeklySplit[currentDayIndex].exercises[exerciseIndex];

    document.getElementById('detailTitle').textContent = exercise.name;
    document.getElementById('detailReps').textContent = `${exercise.sets} sets of ${exercise.reps} reps`;
    document.getElementById('detailTarget').textContent = exercise.targetMuscle;

    const gifElement = document.getElementById('detailGif');
    const overlay = gifElement.nextElementSibling;
    gifElement.src = '';
    gifElement.classList.remove('loaded');
    overlay.textContent = "Loading GIF...";
    overlay.style.display = 'flex';

    const timeoutId = setTimeout(() => {
      if (overlay.style.display === 'flex') {
        overlay.textContent = "GIF Not Available";
      }
    }, 5000);

    const gifUrl = await fetchExerciseGif(exercise.name);
    if (gifUrl) {
      gifElement.onload = () => {
        gifElement.classList.add('loaded');
        overlay.style.display = 'none';
      };
      gifElement.onerror = () => {
        overlay.textContent = "GIF Not Available";
        overlay.style.display = 'flex';
      };
      gifElement.src = gifUrl;
    } else {
      overlay.textContent = "GIF Not Available";
    }

    document.getElementById('dashboardContainer').classList.add('is-detail-view-active');
  }

  function hideDetailView() {
    document.getElementById('dashboardContainer').classList.remove('is-detail-view-active');
  }

  function changeDay(direction) {
    const totalDays = currentWorkoutPlan.weeklySplit.length;
    currentDayIndex = (((currentDayIndex + direction) % totalDays) + totalDays) % totalDays;
    renderDayView(currentDayIndex);
  }

  function startQuoteCycling() {
    const quoteElement = document.getElementById('bigQuote');
    if (!quoteElement) return;

    let quoteIndex = 0;
    quoteElement.textContent = BIG_QUOTES[quoteIndex];

    if (bigQuoteInterval) clearInterval(bigQuoteInterval);
    bigQuoteInterval = setInterval(() => {
      quoteElement.style.opacity = 0;
      setTimeout(() => {
        quoteIndex = (quoteIndex + 1) % BIG_QUOTES.length;
        quoteElement.textContent = BIG_QUOTES[quoteIndex];
        quoteElement.style.opacity = 1;
      }, 500);
    }, 5000);
  }

  async function fetchExerciseGif(exerciseName) {
    if (!GIPHY_API_KEY || GIPHY_API_KEY === 'YOUR_GIPHY_API_KEY') {
      console.warn("Giphy API Key is not set.");
      return '';
    }
    try {
      const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(exerciseName + ' exercise workout')}&limit=1&rating=g`);
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        return data.data[0].images.downsized_large.url;
      }
      return 'https://media.giphy.com/media/3o7TKsQ8UJ7KmX3yR6/giphy.gif';
    } catch (error) {
      console.error("Error fetching GIF:", error);
      return 'https://media.giphy.com/media/3o7TKsQ8UJ7KmX3yR6/giphy.gif';
    }
  }
});