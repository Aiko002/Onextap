import { bootSubPage } from '../sub-page.js';
import * as feedback from '../../features/feedback/feedback.js';
import markup from './contact.html?raw';
import './contact.css';

/* --- Contact: the feedback window, and quick answers before it ---------- */
var page = bootSubPage({ 'contact': { markup: markup }, 'feedback': feedback });
feedback.initFeedback().onToggle(page.hold);
