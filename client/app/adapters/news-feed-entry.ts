import ApplicationAdapter from './application';

export default class NewsFeedEntryAdapter extends ApplicationAdapter {
  urlForQuery(): string {
    return `${this.host}/newsFeedEntries/feed`;
  }
}
