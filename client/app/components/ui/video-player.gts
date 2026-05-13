import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

interface Signature {
  Args: {
    src: string;
    type: string;
    label?: string;
  };
  Element: HTMLDivElement;
}

export default class UiVideoPlayer extends Component<Signature> {
  setupPlayer = modifier(
    (element: HTMLVideoElement, [src, type]: [string, string]) => {
      const player = videojs(element, {
        controls: true,
        fluid: true,
        preload: 'metadata',
        responsive: true,
        sources: [{ src, type }],
      });

      return () => {
        player.dispose();
      };
    }
  );

  <template>
    <div class="ui-video-player" ...attributes>
      <video
        class="video-js vjs-big-play-centered ui-video-player__video"
        controls
        preload="metadata"
        aria-label={{@label}}
        {{this.setupPlayer @src @type}}
      >
        <track kind="captions" />
      </video>
    </div>
  </template>
}
