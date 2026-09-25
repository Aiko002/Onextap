import { bootSubPage } from '../sub-page.js';
import * as feedback from '../../features/feedback/feedback.js';
import markup from './contact.html?raw';
import { sendFeedback } from '../../onextap/index.js';
import './contact.css';

/* --- Contact: the feedback window, and quick answers before it ---------- */
var page = bootSubPage({ 'contact': { markup: markup }, 'feedback': feedback });
// Onextap: a note goes to the support inbox (src/onextap/feedback.js).
feedback.initFeedback({ send: sendFeedback }).onToggle(page.hold);
