import type {
  IState,
  IWritableConnector,
  IConnectorConfig,
  LdesObject,
  LdesObjects,
  ConnectorConfigs,
} from '@treecg/ldes-types';

/**
 * An Orchestrator will handle the synchronization of the Linked Data Event Stream.
 */
export class Orchestrator {
  private readonly stateStore: IState;
  private readonly ldesObjects: LdesObjects;
  private readonly ldesConnectors: Map<LdesObject, IWritableConnector[]> = new Map();
  private readonly connectorsConfig: ConnectorConfigs;

  public constructor(stateStore: IState, ldesObjects: LdesObjects, connectorsConfig: ConnectorConfigs) {
    this.stateStore = stateStore;
    this.ldesObjects = ldesObjects;
    this.connectorsConfig = connectorsConfig;
  }

  /**
   * Start listening to the events and pipe them to the connectors
   */
  public async run(): Promise<void[]> {
    console.debug('START RUN');

    const runs = Array.from(this.ldesConnectors.keys()).map(ldesObject => {
      const connectors = this.ldesConnectors.get(ldesObject);

      if (!connectors) {
        return;
      }

      return new Promise<void>((resolve, reject) => {
        ldesObject.stream
          .on('data', async member => {
            await this.processMember(member.object, connectors);
          })
          .on('error', (error: any) => reject(error));

        ldesObject.stream.on('end', () => resolve());
      });
    });

    return Promise.all(runs);
  }

  public async provision(): Promise<void> {
    const promises: Promise<void>[] = [];
    const state = this.stateStore.provision();

    for (const ldesObject of Object.values(this.ldesObjects)) {
      const ldesConnectors: IWritableConnector[] = [];
      for (const con of Object.values(this.connectorsConfig)) {
        const config = con.settings || {};
        let Connector;
        if (con.type) {
          Connector = await import(`${con.type}`);
        } else {
          throw new Error('connector not found');
        }
        const connectorName = Object.keys(Connector).find(key => key.endsWith('Connector'));

        if (!connectorName) {
          throw new Error(`The connector ${con.type} couldn't be loaded correctly!`);
        }

        const connector = new Connector[connectorName](config, ldesObject.shape, ldesObject.name);

        promises.push(connector.provision());
        ldesConnectors.push(connector);
      }
      this.ldesConnectors.set(ldesObject, ldesConnectors);
    }

    await Promise.all([state, ...promises]);

    console.debug('END PROVISION');
  }

  /**
   * Reset the state
   */
  public reset(): Promise<void> {
    throw new Error('not implemented');
  }

  protected async processData(ldesObject: LdesObject, connectors: IWritableConnector[]): Promise<void> {
    let member: string = ldesObject.stream.read();

    while (member) {
      const copiedMember = member;

      await Promise.all(connectors.map(con => con.writeVersion(copiedMember)));

      member = ldesObject.stream.read();
    }
  }

  protected async processMember(member: string, connectors: IWritableConnector[]): Promise<void> {
    await Promise.all(connectors.map(con => con.writeVersion(member)));
  }
}
