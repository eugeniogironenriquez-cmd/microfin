import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';

@Entity('estados')
export class State {
  @PrimaryGeneratedColumn('increment', { type: 'smallint', unsigned: true }) id: number;
  @Column({ name: 'clave', length: 5 }) code: string;
  @Column({ name: 'nombre', length: 100 }) name: string;
  @OneToMany(() => Municipality, (m) => m.state) municipalities: Municipality[];
}

@Entity('municipios')
export class Municipality {
  @PrimaryGeneratedColumn('increment', { type: 'smallint', unsigned: true }) id: number;
  @ManyToOne(() => State, (s) => s.municipalities)
  @JoinColumn({ name: 'estado_id' })
  state: State;
  @Column({ name: 'estado_id', type: 'smallint', unsigned: true }) stateId: number;
  @Column({ name: 'nombre', length: 150 }) name: string;
}
