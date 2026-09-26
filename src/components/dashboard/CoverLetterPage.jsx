import React, { useState } from 'react';
import { getApplicationTypeConfig } from '../../applicationTypes';
import ProfileSwitcher from '../shared/ProfileSwitcher';
import CoverLetterPanel from '../shared/CoverLetterPanel';

/**
 * Dashboard workspace around CoverLetterPanel: adds a ProfileSwitcher and
 * remounts the panel (via `key`) whenever the active profile changes so it
 * reloads that profile's templates. The workspace's title and description
 * come from the dashboard shell's chapter head.
 *
 * CoverLetterPanel is shared with the popup, so it is not restyled here; it
 * takes the dashboard palette from the `--ox-*` variables the shell sets.
 *
 * @param {object} props
 * @param {(message: string, type?: 'success'|'error'|'loading') => void} props.showToast
 * @param {object|null} props.user
 * @param {string} [props.applicationType='job'] Drives the labels via
 *   getApplicationTypeConfig.
 */
const CoverLetterPage = ({ showToast, user, applicationType = 'job' }) => {
  const appConfig = getApplicationTypeConfig(applicationType);
  const [panelKey, setPanelKey] = useState(0);
  return (
    <>
      <div className="ws-bar">
        <div className="ws-toolbar-grow"><ProfileSwitcher compact onProfileChange={() => setPanelKey((k) => k + 1)} /></div>
      </div>
      <section className="ws-panel" data-accent="">
        <div className="ws-panel-head">
          <div>
            <p className="label ws-eyebrow"><span className="ws-num">A</span>Templates</p>
            <h3 className="ws-panel-title">Your <em>{appConfig.documentLabel.toLowerCase()}</em></h3>
          </div>
        </div>
        <p className="ws-sub" style={{ marginBottom: 18 }}>
          Store multiple {appConfig.documentLabel.toLowerCase()}, personalize one for each application, and fill it from the extension.
        </p>
        <div className="oxd-cover">
          <CoverLetterPanel key={panelKey} showToast={showToast} user={user} applicationType={applicationType} documentLabel={appConfig.coverLetterLabel} />
        </div>
      </section>
    </>
  );
};

export default CoverLetterPage;
