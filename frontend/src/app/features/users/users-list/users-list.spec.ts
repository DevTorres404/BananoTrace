import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UsersService } from '../users.service';
import { UsersList } from './users-list';

describe('UsersList', () => {
  let fixture: ComponentFixture<UsersList>;
  let component: UsersList;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsersList],
      providers: [
        {
          provide: UsersService,
          useValue: { getUsers: vi.fn().mockReturnValue(of([])), setStatus: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('opens creation inside the modal without changing route', () => {
    component.openCreateModal();

    expect(component.isUserModalOpen).toBe(true);
    expect(component.modalUserId).toBeNull();
  });

  it('opens editing for the selected user inside the same modal', () => {
    component.openEditModal('42');

    expect(component.isUserModalOpen).toBe(true);
    expect(component.modalUserId).toBe('42');
  });
});
