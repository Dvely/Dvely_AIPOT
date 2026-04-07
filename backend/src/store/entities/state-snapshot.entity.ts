import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('state_snapshots')
export class StateSnapshotEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'longtext' })
  payload!: string;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
