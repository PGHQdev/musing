
// A/B Testing Configuration
const experiments = {
  headline: {
    variants: [
      {
        name: 'control',
        value: 'let the wisdom of the past guide your present',
        subtitle: 'musing transforms your new tab into a personalized sanctuary of timeless quotes — local by default, with optional BYOK intelligence.'
      },
      {
        name: 'privacy-focused',
        value: 'Context-aware quotes. Private by default.',
        subtitle: 'Your AI conversations inspire your quotes, right in your browser. External requests happen only if you enable Smart Reasons with your own API key.'
      }
    ]
  },
  cta: {
    variants: [
      {
        name: 'control',
        text: 'Add to Chrome'
      },
      {
        name: 'action',
        text: 'Install Free Extension'
      }
    ]
  }
};

// Storage key for consistent user experience
const STORAGE_KEY = 'musing_ab_assignments';

function getAssignment(experimentId) {
  let assignments;
  try {
    assignments = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (error) {
    assignments = null;
  }
  if (!assignments || typeof assignments !== 'object') {
    assignments = {};
  }

  if (!assignments[experimentId]) {
    const variants = experiments[experimentId].variants;
    const randomIndex = Math.floor(Math.random() * variants.length);
    assignments[experimentId] = variants[randomIndex].name;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  }

  return assignments[experimentId];
}

function applyExperiments() {
  // Apply Headline Experiment
  const headlineAssignment = getAssignment('headline');
  const headlineVariant = experiments.headline.variants.find(v => v.name === headlineAssignment);

  if (headlineVariant) {
    const taglineEl = document.querySelector('.tagline');
    const subtitleEl = document.querySelector('.subtitle');

    if (taglineEl) taglineEl.textContent = headlineVariant.value;
    if (subtitleEl) {
      // Preserve the styled brand-text span when the copy starts with the brand name
      const brandSpan = subtitleEl.querySelector('.brand-text');
      if (brandSpan && headlineVariant.subtitle.startsWith('musing')) {
        subtitleEl.textContent = '';
        subtitleEl.appendChild(brandSpan);
        subtitleEl.appendChild(document.createTextNode(headlineVariant.subtitle.slice('musing'.length)));
      } else {
        subtitleEl.textContent = headlineVariant.subtitle;
      }
    }

    console.log(`[A/B] Applied headline variant: ${headlineVariant.name}`);
  }

  // Apply CTA Experiment
  const ctaAssignment = getAssignment('cta');
  const ctaVariant = experiments.cta.variants.find(v => v.name === ctaAssignment);

  if (ctaVariant) {
    const ctaButtons = document.querySelectorAll('.cta-button');
    ctaButtons.forEach(btn => {
      // Preserve the icon
      const icon = btn.querySelector('svg');
      btn.textContent = '';
      if (icon) btn.appendChild(icon);
      btn.appendChild(document.createTextNode(' ' + ctaVariant.text));
    });

    console.log(`[A/B] Applied CTA variant: ${ctaVariant.name}`);
  }

  // Track exposure
  const exposure = { headline: headlineAssignment, cta: ctaAssignment };
  if (window.umami && typeof window.umami.track === 'function') {
    window.umami.track('ab-exposure', exposure);
  } else {
    console.log('[A/B] Tracking exposure:', exposure);
  }
}

// Run on load; always reveal the elements the anti-flicker style hid
document.addEventListener('DOMContentLoaded', () => {
  try {
    applyExperiments();
  } finally {
    document.documentElement.classList.remove('ab-pending');
  }
});
